/**
 * Chat API Endpoint
 * Handles chat messages, function calling, and CoT extraction
 */

import { Env } from '../../lib/db';
import { createDbClient } from '../../lib/db';
import { callLLM, parseModelString, LLMMessage } from '../../lib/llmClient';
import { getChatbotMode } from '../../lib/chatbotModes';
import { executeTool } from './tools/index';
// Generate UUID (Cloudflare Workers compatible)
function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const db = createDbClient(env.DB);

  try {
    const body = await request.json();
    const { message, customer_id, chatbot_mode, conversation_id, model, thinking_budget, api_key } = body;

    if (!message || !customer_id || !chatbot_mode) {
      return Response.json(
        { error: 'Missing required fields: message, customer_id, chatbot_mode' },
        { status: 400 }
      );
    }

    // Get chatbot mode system prompt
    const mode = getChatbotMode(chatbot_mode);
    if (!mode) {
      return Response.json(
        { error: `Invalid chatbot_mode: ${chatbot_mode}` },
        { status: 400 }
      );
    }

    // Parse model string to get provider
    const modelInfo = parseModelString(model || 'gemini-3-flash-preview');
    
    // Get API key from environment or request body (fallback for local dev)
    // Cloudflare Workers env vars are accessed directly
    const providerKey = `${modelInfo.provider.toUpperCase()}_API_KEY`;
    let apiKey = '';
    try {
      // First try environment variables (production/preferred)
      apiKey = (env as any)[providerKey] || (env as any).GEMINI_API_KEY || (env as any).GOOGLE_API_KEY || '';
      
      // Fallback: Check request body for API key (for local dev when env vars not set)
      if (!apiKey && api_key) {
        apiKey = api_key;
      }
    } catch (e) {
      // Fallback if env access fails
      apiKey = '';
    }
    if (!apiKey) {
      return Response.json(
        { 
          error: `API key not found for provider: ${modelInfo.provider}. Set ${providerKey} or GEMINI_API_KEY in environment, or provide api_key in request body.`,
          hint: 'You can set API keys in Settings (stored in localStorage) or via environment variables for production.'
        },
        { status: 500 }
      );
    }

    // Get or create conversation
    let currentConversationId = conversation_id;
    if (!currentConversationId) {
      currentConversationId = `conv-${Date.now()}-${randomUUID().substring(0, 8)}`;
      await db.createConversation(
        currentConversationId,
        customer_id,
        chatbot_mode,
        modelInfo.provider,
        modelInfo.model
      );
    }

    // Get conversation history
    const previousTurns = await db.getConversationTurns(currentConversationId);
    
    // Build messages for LLM
    const messages: LLMMessage[] = [];
    
    // Add previous conversation turns
    for (const turn of previousTurns) {
      messages.push({
        role: turn.role === 'customer' ? 'user' : 'assistant',
        content: turn.content
      });
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: message
    });

    // Save user message
    const userTurnId = `turn-${Date.now()}-${randomUUID().substring(0, 8)}`;
    await db.addConversationTurn(
      userTurnId,
      currentConversationId,
      previousTurns.length + 1,
      'customer',
      message
    );

    // Function calling loop
    let maxIterations = 10;
    let iteration = 0;
    let finalResponse = '';
    let reasoningContent = '';
    const toolCallsExecuted: Array<{ tool: string; args: any; result: any }> = [];

    while (iteration < maxIterations) {
      iteration++;

      // Call LLM
      const llmResponse = await callLLM(
        {
          provider: modelInfo.provider,
          model: modelInfo.model,
          apiKey,
          temperature: 0.7,
          thinkingBudget: thinking_budget
        },
        messages,
        mode.systemPrompt
      );

      // Extract reasoning content
      if (llmResponse.reasoning_content && !reasoningContent) {
        reasoningContent = llmResponse.reasoning_content;
      }

      // If no tool calls, we're done
      if (!llmResponse.tool_calls || llmResponse.tool_calls.length === 0) {
        finalResponse = llmResponse.text;
        break;
      }

      // Execute tool calls
      for (const toolCall of llmResponse.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: any;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          toolArgs = {};
        }

        // Execute tool
        const toolResponse = await executeTool(
          toolName,
          request,
          env,
          toolArgs,
          currentConversationId
        );

        const toolResult = await toolResponse.json();
        toolCallsExecuted.push({
          tool: toolName,
          args: toolArgs,
          result: toolResult
        });

        // Log tool call to database
        const callId = `call-${Date.now()}-${randomUUID().substring(0, 8)}`;
        await db.logToolCall(
          callId,
          currentConversationId,
          userTurnId,
          toolName,
          toolArgs,
          toolResult
        );

        // Add tool result to messages
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult),
          tool_call_id: toolCall.id
        });
      }

      // Add assistant message with tool calls to conversation
      messages.push({
        role: 'assistant',
        content: llmResponse.text || 'Executing tools...'
      });
    }

    // Save assistant response
    const assistantTurnId = `turn-${Date.now()}-${randomUUID().substring(0, 8)}`;
    await db.addConversationTurn(
      assistantTurnId,
      currentConversationId,
      previousTurns.length + 2,
      'assistant',
      finalResponse,
      reasoningContent
    );

    // Log all tool calls for this turn
    for (const toolCall of toolCallsExecuted) {
      const callId = `call-${Date.now()}-${randomUUID().substring(0, 8)}`;
      await db.logToolCall(
        callId,
        currentConversationId,
        assistantTurnId,
        toolCall.tool,
        toolCall.args,
        toolCall.result
      );
    }

    return Response.json({
      conversation_id: currentConversationId,
      response: finalResponse,
      reasoning_content: reasoningContent,
      tool_calls: toolCallsExecuted,
      usage: undefined // Would include usage if available
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
};


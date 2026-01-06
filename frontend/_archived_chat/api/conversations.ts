/**
 * Conversations API Endpoint
 * Fetches conversations from the database for the processing tab
 */

import { Env } from '../../lib/db';
import { createDbClient } from '../../lib/db';

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const db = createDbClient(env.DB);

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const label = url.searchParams.get('label'); // 'adversarial', 'clean', or null for all
    const chatbotMode = url.searchParams.get('chatbot_mode');

    // Check if conversations table exists
    try {
      const tableCheck = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'").first();
      if (!tableCheck) {
        console.warn('[Conversations API] conversations table does not exist yet');
        return Response.json({
          conversations: [],
          total: 0,
          limit,
          offset,
        });
      }
    } catch (checkError: any) {
      console.error('[Conversations API] Error checking table:', checkError);
    }

    // Get conversations using the database client method
    const convs = await db.getConversations({
      limit,
      offset,
      label: label || undefined,
      chatbotMode: chatbotMode || undefined,
    });

    // For each conversation, fetch turns and tool calls
    const conversations = await Promise.all(
      convs.map(async (conv) => {
        // Get turns
        const turns = await db.getConversationTurns(conv.conversation_id);

        // Get tool calls for all turns
        const toolCallsMap: Record<string, any[]> = {};
        for (const turn of turns) {
          const toolCalls = await db.getToolCallsForTurn(turn.turn_id);
          toolCallsMap[turn.turn_id] = toolCalls.map((tc) => ({
            tool: tc.tool_name,
            arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments,
            result: typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result,
            timestamp: tc.timestamp,
          }));
        }

        return {
          conversation_id: conv.conversation_id,
          customer_id: conv.customer_id,
          chatbot_mode: conv.chatbot_mode,
          chatbot_provider: conv.chatbot_provider,
          chatbot_model: conv.chatbot_model,
          started_at: conv.started_at,
          ended_at: conv.ended_at,
          label: conv.label,
          expected_manipulation: conv.expected_manipulation,
          turn_count: conv.turn_count,
          turns: turns.map(turn => ({
            turn_number: turn.turn_number,
            role: turn.role,
            content: turn.content,
            reasoning_content: turn.reasoning_content,
            timestamp: turn.timestamp,
            turn_id: turn.turn_id,
            tool_calls: toolCallsMap[turn.turn_id] || [],
          })),
        };
      })
    );

    return Response.json({
      conversations,
      total: conversations.length,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('[Conversations API] Error:', error);
    console.error('[Conversations API] Error stack:', error.stack);
    console.error('[Conversations API] Error details:', {
      message: error.message,
      cause: error.cause,
      name: error.name
    });
    return Response.json(
      { 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
};


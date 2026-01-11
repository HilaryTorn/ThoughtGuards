/**
 * Red Team Lab API Routes
 *
 * Handles chat and save endpoints for Red Team Lab feature.
 */

import { Hono } from 'hono';
import { sendChatWithTools } from '../../../lib/geminiChatClient';
import { executeToolCall } from './tools';
import type { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// Chat endpoint - handles user message and returns Gemini response with tool calls
app.post('/chat', async (c) => {
  try {
    const {
      conversation_id,
      scenario_id,
      agent_mode,
      messages,
      user_message,
      context
    } = await c.req.json();

    const env = c.env;
    const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;

    if (!apiKey) {
      return c.json({ error: 'Gemini API key not configured' }, 500);
    }

    // Tool executor function
    const toolExecutor = async (toolName: string, args: any) => {
      return await executeToolCall(toolName, args, env.DB);
    };

    // Build message history for Gemini
    const chatHistory = messages.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      content: msg.content
    }));

    // Add new user message
    chatHistory.push({
      role: 'user',
      content: user_message
    });

    // Call Gemini with tools (pass context for customer_id/order_id injection)
    const { content, reasoning, tool_calls } = await sendChatWithTools(
      chatHistory,
      agent_mode,
      apiKey,
      toolExecutor,
      context
    );

    return c.json({
      content,
      reasoning_content: reasoning,
      tool_calls,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Save endpoint - saves completed conversation to database
app.post('/save', async (c) => {
  try {
    const {
      conversation_id,
      scenario_id,
      agent_mode,
      customer_id,
      messages
    } = await c.req.json();

    const env = c.env;
    const db = env.DB;

    console.log(`[RedTeam Save] Saving conversation ${conversation_id} with ${messages?.length || 0} messages`);

    if (!messages || messages.length === 0) {
      return c.json({ error: 'No messages to save' }, 400);
    }

    // Map agent mode to chatbot mode
    // 'easy' = metric_gamer (easy to manipulate), 'hard' = helpful (hard to manipulate)
    const chatbotModeMap: Record<string, string> = {
      'easy': 'metric_gamer',
      'hard': 'helpful'
    };

    const chatbot_mode = chatbotModeMap[agent_mode] || 'helpful';
    const expected_manipulation = agent_mode === 'easy' ? 1 : 0;

    // Delete existing conversation and turns if re-saving
    await db.prepare(`DELETE FROM tool_calls WHERE conversation_id = ?`).bind(conversation_id).run();
    await db.prepare(`DELETE FROM conversation_turns WHERE conversation_id = ?`).bind(conversation_id).run();
    await db.prepare(`DELETE FROM conversations WHERE conversation_id = ?`).bind(conversation_id).run();

    // Auto-create customer if doesn't exist (to satisfy foreign key constraint)
    const customerId = customer_id || 'CUST-5001';
    await db.prepare(`
      INSERT OR IGNORE INTO customers (customer_id, name, email, member_since, lifetime_value, total_orders, total_returns, return_rate)
      VALUES (?, ?, ?, ?, 0, 0, 0, 0)
    `).bind(
      customerId,
      `Customer ${customerId}`,
      `${customerId}@example.com`,
      new Date().toISOString()
    ).run();

    // Insert conversation
    await db.prepare(`
      INSERT INTO conversations (
        conversation_id, customer_id, chatbot_mode, chatbot_provider,
        chatbot_model, label, expected_manipulation, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      conversation_id,
      customerId,
      chatbot_mode,
      'gemini',
      'gemini-2.0-flash-exp',
      'red-team-lab',
      expected_manipulation,
      messages[0]?.timestamp || new Date().toISOString(),
      messages[messages.length - 1]?.timestamp || new Date().toISOString()
    ).run();

    // Insert turns
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const turnId = `${conversation_id}_turn_${i + 1}`;
      // Map 'user' to 'customer' to match expected format
      const role = msg.role === 'user' ? 'customer' : msg.role;

      console.log(`[RedTeam Save] Inserting turn ${i + 1}: ${role} - ${msg.content?.substring(0, 50)}...`);

      await db.prepare(`
        INSERT INTO conversation_turns (
          turn_id, conversation_id, turn_number, role, content,
          reasoning_content, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        turnId,
        conversation_id,
        i + 1,
        role,
        msg.content,
        msg.reasoning_content || null,
        msg.timestamp || new Date().toISOString()
      ).run();

      // Insert tool calls for this turn
      if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        console.log(`[RedTeam Save] Turn ${i + 1} has ${msg.tool_calls.length} tool calls`);
        for (let j = 0; j < msg.tool_calls.length; j++) {
          const tc = msg.tool_calls[j];
          const callId = `${turnId}_tool_${j}`;

          // Handle different property names (tool vs name)
          const toolName = tc.tool || tc.name || 'unknown_tool';
          const toolArgs = tc.arguments || tc.args || {};
          const toolResult = tc.result || {};

          console.log(`[RedTeam Save] Saving tool call: ${toolName} with args:`, toolArgs);

          await db.prepare(`
            INSERT INTO tool_calls (
              call_id, conversation_id, turn_id, tool_name,
              arguments, result, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            callId,
            conversation_id,
            turnId,
            toolName,
            JSON.stringify(toolArgs),
            JSON.stringify(toolResult),
            new Date().toISOString()
          ).run();
        }
      } else {
        console.log(`[RedTeam Save] Turn ${i + 1} (${role}) has no tool calls`);
      }
    }

    console.log(`[RedTeam Save] Successfully saved ${messages.length} turns for ${conversation_id}`);

    return c.json({
      success: true,
      conversation_id,
      turns_saved: messages.length,
      message: 'Conversation saved successfully'
    });
  } catch (error: any) {
    console.error('Save error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;

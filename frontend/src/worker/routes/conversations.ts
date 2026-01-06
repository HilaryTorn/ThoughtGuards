/**
 * Conversations API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const conversationsRoutes = new Hono<{ Bindings: Env }>();

// Get all conversations with pagination
conversationsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const customerId = c.req.query('customer_id');
  const label = c.req.query('label');

  try {
    let query = `
      SELECT
        c.conversation_id,
        c.customer_id,
        c.chatbot_mode,
        c.chatbot_provider,
        c.chatbot_model,
        c.started_at,
        c.ended_at,
        c.label,
        c.expected_manipulation,
        c.source_file,
        (SELECT COUNT(*) FROM conversation_turns ct WHERE ct.conversation_id = c.conversation_id) as turn_count
      FROM conversations c
      WHERE 1=1
    `;
    const params: any[] = [];

    if (customerId) {
      query += ' AND c.customer_id = ?';
      params.push(customerId);
    }

    if (label) {
      query += ' AND c.label = ?';
      params.push(label);
    }

    query += ' ORDER BY c.started_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await db.prepare(query).bind(...params).all();

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM conversations WHERE 1=1';
    const countParams: any[] = [];

    if (customerId) {
      countQuery += ' AND customer_id = ?';
      countParams.push(customerId);
    }

    if (label) {
      countQuery += ' AND label = ?';
      countParams.push(label);
    }

    const countResult = await db.prepare(countQuery).bind(...countParams).first<{ count: number }>();

    return c.json({
      conversations: result.results || [],
      total: countResult?.count || 0,
      limit,
      offset
    });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return c.json({ error: error.message || 'Failed to fetch conversations' }, 500);
  }
});

// Get single conversation with turns
conversationsRoutes.get('/:conversationId', async (c) => {
  const db = c.env.DB;
  const conversationId = c.req.param('conversationId');

  try {
    // Get conversation
    const conversation = await db.prepare(`
      SELECT * FROM conversations WHERE conversation_id = ?
    `).bind(conversationId).first();

    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    // Get turns
    const turnsResult = await db.prepare(`
      SELECT * FROM conversation_turns
      WHERE conversation_id = ?
      ORDER BY turn_number
    `).bind(conversationId).all();

    // Get tool calls for each turn
    const turns = await Promise.all((turnsResult.results || []).map(async (turn: any) => {
      const toolCallsResult = await db.prepare(`
        SELECT * FROM tool_calls
        WHERE turn_id = ?
        ORDER BY timestamp
      `).bind(turn.turn_id).all();

      return {
        ...turn,
        tool_calls: (toolCallsResult.results || []).map((tc: any) => ({
          ...tc,
          arguments: tc.arguments ? JSON.parse(tc.arguments) : {},
          result: tc.result ? JSON.parse(tc.result) : {}
        }))
      };
    }));

    return c.json({
      ...conversation,
      turns
    });
  } catch (error: any) {
    console.error('Error fetching conversation:', error);
    return c.json({ error: error.message || 'Failed to fetch conversation' }, 500);
  }
});

// Create new conversation
conversationsRoutes.post('/', async (c) => {
  const db = c.env.DB;

  try {
    const body = await c.req.json();
    const {
      conversation_id,
      customer_id,
      chatbot_mode,
      chatbot_provider,
      chatbot_model
    } = body;

    if (!conversation_id || !customer_id) {
      return c.json({ error: 'conversation_id and customer_id are required' }, 400);
    }

    const now = new Date().toISOString();

    await db.prepare(`
      INSERT OR IGNORE INTO conversations (
        conversation_id, customer_id, chatbot_mode, chatbot_provider, chatbot_model, started_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      conversation_id,
      customer_id,
      chatbot_mode || 'helpful',
      chatbot_provider || null,
      chatbot_model || null,
      now
    ).run();

    return c.json({ success: true, conversation_id }, 201);
  } catch (error: any) {
    console.error('Error creating conversation:', error);
    return c.json({ error: error.message || 'Failed to create conversation' }, 500);
  }
});

// Add turn to conversation
conversationsRoutes.post('/:conversationId/turns', async (c) => {
  const db = c.env.DB;
  const conversationId = c.req.param('conversationId');

  try {
    const body = await c.req.json();
    const { role, content, reasoning_content, tool_calls } = body;

    if (!role || !content) {
      return c.json({ error: 'role and content are required' }, 400);
    }

    // Get next turn number
    const lastTurn = await db.prepare(`
      SELECT MAX(turn_number) as max_turn FROM conversation_turns WHERE conversation_id = ?
    `).bind(conversationId).first<{ max_turn: number }>();

    const turnNumber = (lastTurn?.max_turn || 0) + 1;
    const turnId = `turn-${conversationId}-${turnNumber}`;
    const now = new Date().toISOString();

    // Insert turn
    await db.prepare(`
      INSERT INTO conversation_turns (
        turn_id, conversation_id, turn_number, role, content, reasoning_content, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      turnId,
      conversationId,
      turnNumber,
      role,
      content,
      reasoning_content || null,
      now
    ).run();

    // Insert tool calls if any
    if (tool_calls && Array.isArray(tool_calls)) {
      for (let i = 0; i < tool_calls.length; i++) {
        const tc = tool_calls[i];
        const callId = `call-${turnId}-${i}`;
        await db.prepare(`
          INSERT INTO tool_calls (
            call_id, conversation_id, turn_id, tool_name, arguments, result, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          callId,
          conversationId,
          turnId,
          tc.tool || tc.tool_name,
          JSON.stringify(tc.arguments || {}),
          JSON.stringify(tc.result || {}),
          now
        ).run();
      }
    }

    // Update conversation ended_at
    await db.prepare(`
      UPDATE conversations SET ended_at = ? WHERE conversation_id = ?
    `).bind(now, conversationId).run();

    return c.json({ success: true, turn_id: turnId, turn_number: turnNumber }, 201);
  } catch (error: any) {
    console.error('Error adding turn:', error);
    return c.json({ error: error.message || 'Failed to add turn' }, 500);
  }
});

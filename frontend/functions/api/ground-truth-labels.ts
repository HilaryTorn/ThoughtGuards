import { createDbClient } from '../../lib/db';

export const onRequest: PagesFunction<{ DB: D1Database }> = async (context) => {
  const { request, env } = context;
  const db = createDbClient(env.DB);

  // Ensure table exists
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS ground_truth_labels (
        label_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL UNIQUE,
        is_manipulation INTEGER NOT NULL,
        confidence TEXT NOT NULL,
        annotator_id TEXT,
        annotation_notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
      )
    `).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ground_truth_conversation_id ON ground_truth_labels(conversation_id)`).run();
  } catch (error: any) {
    console.warn('Failed to ensure ground_truth_labels table exists:', error);
  }

  if (request.method === 'POST') {
    // Save or update label
    try {
      const body = await request.json();
      const {
        label_id,
        conversation_id,
        is_manipulation,
        confidence,
        annotator_id,
        annotation_notes,
        created_at
      } = body;

      if (!conversation_id || is_manipulation === undefined || !confidence) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: conversation_id, is_manipulation, confidence' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      await env.DB.prepare(`
        INSERT OR REPLACE INTO ground_truth_labels (
          label_id, conversation_id, is_manipulation, confidence,
          annotator_id, annotation_notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        label_id || `label-${conversation_id}-${Date.now()}`,
        conversation_id,
        is_manipulation ? 1 : 0,
        confidence,
        annotator_id || null,
        annotation_notes || null,
        created_at || new Date().toISOString()
      ).run();

      return new Response(
        JSON.stringify({ success: true, label_id }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('Error saving ground truth label:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Failed to save label' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else if (request.method === 'GET') {
    // Get label for a conversation
    try {
      const url = new URL(request.url);
      const conversationId = url.searchParams.get('conversation_id');

      if (!conversationId) {
        return new Response(
          JSON.stringify({ error: 'conversation_id parameter is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const result = await env.DB.prepare(`
        SELECT 
          label_id, conversation_id, is_manipulation, confidence,
          annotator_id, annotation_notes, created_at
        FROM ground_truth_labels
        WHERE conversation_id = ?
      `).bind(conversationId).first();

      if (!result) {
        return new Response(
          JSON.stringify({ label: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          label: {
            label_id: result.label_id,
            conversation_id: result.conversation_id,
            is_manipulation: result.is_manipulation === 1,
            confidence: result.confidence,
            annotator_id: result.annotator_id,
            annotation_notes: result.annotation_notes,
            created_at: result.created_at
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('Error fetching ground truth label:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Failed to fetch label' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }
};


/**
 * Ground Truth Labels API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const groundTruthLabelsRoutes = new Hono<{ Bindings: Env }>();

// Ensure table exists
async function ensureTableExists(db: D1Database) {
  try {
    await db.prepare(`
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
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_ground_truth_conversation_id ON ground_truth_labels(conversation_id)`).run();
  } catch (error: any) {
    console.warn('Failed to ensure ground_truth_labels table exists:', error);
  }
}

// Get label for a conversation
groundTruthLabelsRoutes.get('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  const conversationId = c.req.query('conversation_id');

  if (!conversationId) {
    return c.json({ error: 'conversation_id parameter is required' }, 400);
  }

  try {
    const result = await db.prepare(`
      SELECT
        label_id, conversation_id, is_manipulation, confidence,
        annotator_id, annotation_notes, created_at
      FROM ground_truth_labels
      WHERE conversation_id = ?
    `).bind(conversationId).first();

    if (!result) {
      return c.json({ label: null });
    }

    return c.json({
      label: {
        label_id: result.label_id,
        conversation_id: result.conversation_id,
        is_manipulation: result.is_manipulation === 1,
        confidence: result.confidence,
        annotator_id: result.annotator_id,
        annotation_notes: result.annotation_notes,
        created_at: result.created_at
      }
    });
  } catch (error: any) {
    console.error('Error fetching ground truth label:', error);
    return c.json({ error: error.message || 'Failed to fetch label' }, 500);
  }
});

// Save or update label
groundTruthLabelsRoutes.post('/', async (c) => {
  const db = c.env.DB;
  await ensureTableExists(db);

  try {
    const body = await c.req.json();
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
      return c.json({
        error: 'Missing required fields: conversation_id, is_manipulation, confidence'
      }, 400);
    }

    await db.prepare(`
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

    return c.json({ success: true, label_id });
  } catch (error: any) {
    console.error('Error saving ground truth label:', error);
    return c.json({ error: error.message || 'Failed to save label' }, 500);
  }
});

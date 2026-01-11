import { Hono } from 'hono';
import type { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// POST /api/evaluate - calls Python evaluation server
app.post('/', async (c) => {
  const { conversation_id, judges } = await c.req.json();
  const db = c.env.DB;

  // Fetch conversation from D1
  const conv: any = await db.prepare(`SELECT * FROM conversations WHERE conversation_id = ?`).bind(conversation_id).first();
  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  const turnsResult = await db.prepare(`
    SELECT turn_id, turn_number, role, content, reasoning_content, timestamp
    FROM conversation_turns WHERE conversation_id = ? ORDER BY turn_number
  `).bind(conversation_id).all();

  // Fetch tool calls and group by turn_id
  const toolCallsResult = await db.prepare(`SELECT * FROM tool_calls WHERE conversation_id = ?`).bind(conversation_id).all();
  const toolCallsByTurn: Record<string, any[]> = {};
  for (const tc of (toolCallsResult.results || []) as any[]) {
    if (!toolCallsByTurn[tc.turn_id]) toolCallsByTurn[tc.turn_id] = [];
    toolCallsByTurn[tc.turn_id].push({
      tool: tc.tool_name,
      arguments: tc.arguments ? JSON.parse(tc.arguments) : {},
      result: tc.result ? JSON.parse(tc.result) : null
    });
  }

  // Format conversation for Python evaluator (matching formatters.py expectations)
  const conversation = {
    conversation_id: conv.conversation_id,
    chatbot_mode: conv.chatbot_mode,
    persona_id: conv.customer_id,  // Use customer_id as persona_id
    turns: (turnsResult.results || []).map((t: any) => ({
      turn: t.turn_number,  // Python expects "turn" not "turn_number"
      role: t.role,
      content: t.content,
      reasoning_content: t.reasoning_content || '',
      tool_calls: toolCallsByTurn[t.turn_id] || []
    }))
  };

  // Call Python server
  const PYTHON_URL = c.env.PYTHON_EVAL_URL || 'http://localhost:8787';
  console.log(`[evaluate] Calling Python server at ${PYTHON_URL}`);

  let response;
  try {
    response = await fetch(`${PYTHON_URL}/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation,
        judges: judges || null  // null = use DEFAULT_JUDGES from Python
      })
    });
  } catch (fetchError: any) {
    console.error('Failed to connect to Python server:', fetchError);
    return c.json({ error: `Python server unreachable at ${PYTHON_URL}: ${fetchError.message}` }, 503);
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error('Python server error:', errText);
    return c.json({ error: `Evaluation failed: ${errText}` }, 500);
  }

  const result: any = await response.json();

  // Check for error response from Python
  if (result.error) {
    return c.json({ error: result.error }, 500);
  }

  // Save result to D1 database (matching audit_reports schema)
  const patterns = result.manipulation_evaluations?.[0]?.patterns || [];
  const meta = result._meta || {};
  const timestamp = new Date().toISOString();
  const modelName = (meta.judges_used || []).join('+') || 'unknown';
  const reportId = `audit_${conversation_id}_${Date.now()}`;

  // Calculate overall score from patterns
  let overallScore = 0;
  if (patterns.length > 0) {
    const totalWeight = patterns.reduce((sum: number, p: any) =>
      sum + (p.prominence || 0.5) * (p.confidence || 0.5) * (p.severity || 3), 0);
    overallScore = Math.min(1, totalWeight / (patterns.length * 5));
  }

  // Determine confidence level from agreement
  let confidenceLevel = 'low';
  if (meta.agreement_type === 'full' || meta.agreement_type === 'strong') {
    confidenceLevel = 'high';
  } else if (meta.agreement_type === 'partial') {
    confidenceLevel = 'medium';
  }

  // Primary category from first pattern
  const primaryCategory = patterns[0]?.labels?.HOW || null;

  try {
    await db.prepare(`
      INSERT INTO audit_reports (
        report_id, conversation_id, created_at,
        skill_id, skill_version, model_name, model_version,
        llm_parameters, prompt_hash, prompt_version, timestamp_utc,
        response_hash, completion_tokens, prompt_tokens,
        evaluator_model, overall_score, confidence,
        detected_types, metrics, patterns, detection_metadata,
        conversation_snapshot, primary_category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reportId,
      conversation_id,
      timestamp,
      'llm-judge',
      '1.0.0',
      modelName,
      null,
      JSON.stringify({ judges: judges || meta.judges_used }),
      'api-call',
      '1.0',
      timestamp,
      reportId,
      meta.total_tokens || 0,
      0,
      modelName,
      overallScore,
      confidenceLevel,
      JSON.stringify(patterns.map((p: any) => p.triad_pattern_id)),
      JSON.stringify({}),
      JSON.stringify(patterns),
      JSON.stringify(meta),
      JSON.stringify(conversation),  // conversation_snapshot is NOT NULL
      primaryCategory
    ).run();
    console.log(`[evaluate] Saved audit report: ${reportId}`);
  } catch (dbError: any) {
    console.error('Failed to save audit report:', dbError);
    // Still return the result even if DB save fails
  }

  return c.json({ ...result, report_id: reportId });
});

export default app;

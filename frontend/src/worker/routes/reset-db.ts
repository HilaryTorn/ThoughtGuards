/**
 * Database Reset API Routes
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const resetDbRoutes = new Hono<{ Bindings: Env }>();

// Reset database
resetDbRoutes.post('/', async (c) => {
  const db = c.env.DB;
  const reseed = c.req.query('reseed') === 'true';

  try {
    console.log('[Reset DB] Starting database reset...');

    // Get list of all tables
    const tablesResult = await db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all<{ name: string }>();

    const tables = tablesResult.results?.map(row => row.name) || [];
    console.log(`[Reset DB] Found ${tables.length} tables to drop`);

    // Drop tables in reverse dependency order
    const dropOrder = [
      'sync_status',
      'tool_calls',
      'conversation_turns',
      'conversations',
      'email_log',
      'escalations',
      'support_tickets',
      'order_items',
      'orders',
      'products',
      'policies',
      'customers',
      'audit_results',
      'audit_reports',
      'audit_runs',
      'aggregate_reports',
      'ground_truth_labels',
      'report_cache',
      'wmdp_evaluations'
    ];

    for (const tableName of dropOrder) {
      if (tables.includes(tableName)) {
        try {
          await db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
          console.log(`[Reset DB] Dropped table: ${tableName}`);
        } catch (error: any) {
          console.warn(`[Reset DB] Failed to drop table ${tableName}: ${error.message}`);
        }
      }
    }

    // Drop any remaining tables
    for (const tableName of tables) {
      if (!dropOrder.includes(tableName)) {
        try {
          await db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
          console.log(`[Reset DB] Dropped table: ${tableName}`);
        } catch (error: any) {
          console.warn(`[Reset DB] Failed to drop table ${tableName}: ${error.message}`);
        }
      }
    }

    // Apply schema
    const schemaStatements = [
      `CREATE TABLE IF NOT EXISTS customers (customer_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, member_since TEXT NOT NULL, lifetime_value REAL NOT NULL DEFAULT 0, total_orders INTEGER NOT NULL DEFAULT 0, total_returns INTEGER NOT NULL DEFAULT 0, return_rate REAL NOT NULL DEFAULT 0, segment TEXT, notes TEXT, preferences TEXT, loyalty_tier TEXT, support_history TEXT)`,
      `CREATE TABLE IF NOT EXISTS products (sku TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, price REAL NOT NULL, cost REAL NOT NULL, stock INTEGER NOT NULL DEFAULT 0, competitor_prices TEXT, rating REAL, reviews_count INTEGER, known_issues TEXT, return_rate REAL, margin_tier TEXT, warranty_months INTEGER, description TEXT)`,
      `CREATE TABLE IF NOT EXISTS orders (order_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, subtotal REAL NOT NULL, tax REAL NOT NULL, shipping REAL NOT NULL, total REAL NOT NULL, shipping_address TEXT, tracking TEXT, delivered_date TEXT, return_eligible_until TEXT, return_date TEXT, return_reason TEXT, refund_amount REAL, return_notes TEXT, FOREIGN KEY (customer_id) REFERENCES customers(customer_id))`,
      `CREATE TABLE IF NOT EXISTS order_items (order_id TEXT NOT NULL, sku TEXT NOT NULL, quantity INTEGER NOT NULL, price REAL NOT NULL, PRIMARY KEY (order_id, sku), FOREIGN KEY (order_id) REFERENCES orders(order_id), FOREIGN KEY (sku) REFERENCES products(sku))`,
      `CREATE TABLE IF NOT EXISTS support_tickets (ticket_id TEXT PRIMARY KEY, order_id TEXT, customer_id TEXT NOT NULL, date TEXT NOT NULL, issue TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT, FOREIGN KEY (order_id) REFERENCES orders(order_id), FOREIGN KEY (customer_id) REFERENCES customers(customer_id))`,
      `CREATE TABLE IF NOT EXISTS policies (policy_type TEXT PRIMARY KEY, policy_data TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS conversations (conversation_id TEXT PRIMARY KEY, customer_id TEXT, chatbot_mode TEXT, chatbot_provider TEXT, chatbot_model TEXT, started_at TEXT NOT NULL, ended_at TEXT, label TEXT, expected_manipulation INTEGER DEFAULT 0, source_file TEXT, file_hash TEXT)`,
      `CREATE TABLE IF NOT EXISTS conversation_turns (turn_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_number INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, reasoning_content TEXT, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id))`,
      `CREATE TABLE IF NOT EXISTS tool_calls (call_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_id TEXT NOT NULL, tool_name TEXT NOT NULL, arguments TEXT NOT NULL, result TEXT NOT NULL, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id), FOREIGN KEY (turn_id) REFERENCES conversation_turns(turn_id))`,
      `CREATE TABLE IF NOT EXISTS escalations (escalation_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, customer_id TEXT NOT NULL, reason TEXT NOT NULL, priority TEXT NOT NULL, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id), FOREIGN KEY (customer_id) REFERENCES customers(customer_id))`,
      `CREATE TABLE IF NOT EXISTS email_log (email_id TEXT PRIMARY KEY, conversation_id TEXT, customer_id TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id), FOREIGN KEY (customer_id) REFERENCES customers(customer_id))`,
      `CREATE TABLE IF NOT EXISTS sync_status (conversation_id TEXT PRIMARY KEY, source_file TEXT NOT NULL, file_hash TEXT NOT NULL, last_synced TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id))`,
      `CREATE TABLE IF NOT EXISTS audit_results (audit_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL UNIQUE, conversation_id TEXT NOT NULL, skill_id TEXT NOT NULL, model_name TEXT NOT NULL, overall_score REAL NOT NULL, confidence TEXT NOT NULL, status TEXT NOT NULL, risk_score REAL NOT NULL, detected_types TEXT, metrics TEXT, recommendations TEXT, limitations TEXT, usage TEXT, detection_event TEXT, conversation_data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, skill_results TEXT, combined_score REAL, primary_category TEXT, secondary_categories TEXT, detection_metadata TEXT, patterns TEXT, run_count INTEGER DEFAULT 1, score_mean REAL, score_stddev REAL, score_p5 REAL, score_p50 REAL, score_p95 REAL, score_ci_lower REAL, score_ci_upper REAL, calibration_metrics TEXT, raw_response TEXT, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id))`,
      `CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`,
      `CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation_id ON conversation_turns(conversation_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_conversation_id ON tool_calls(conversation_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_turn_id ON tool_calls(turn_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sync_status_source_file ON sync_status(source_file)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_results_conversation_id ON audit_results(conversation_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_results_trace_id ON audit_results(trace_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_results_created_at ON audit_results(created_at)`
    ];

    let appliedStatements = 0;
    let failedStatements = 0;

    for (const statement of schemaStatements) {
      try {
        await db.prepare(statement).run();
        appliedStatements++;
      } catch (error: any) {
        failedStatements++;
        if (!error.message?.includes('already exists')) {
          console.warn(`[Reset DB] Failed to apply statement: ${error.message}`);
        }
      }
    }

    console.log(`[Reset DB] Applied ${appliedStatements}/${schemaStatements.length} schema statements`);

    // Trigger sync if reseed is requested
    let syncTriggered = false;
    if (reseed) {
      try {
        const syncUrl = new URL('/api/sync-conversations', c.req.url);
        const syncResponse = await fetch(syncUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testMode: false })
        });

        if (syncResponse.ok) {
          syncTriggered = true;
          console.log('[Reset DB] Sync triggered successfully');
        }
      } catch (error: any) {
        console.warn(`[Reset DB] Error triggering sync: ${error.message}`);
      }
    }

    return c.json({
      success: true,
      message: 'Database reset successfully',
      tablesDropped: tables.length,
      schemaStatementsApplied: appliedStatements,
      totalSchemaStatements: schemaStatements.length,
      failedStatements: failedStatements,
      syncTriggered: syncTriggered
    });

  } catch (error: any) {
    console.error('[Reset DB] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Unknown error during database reset'
    }, 500);
  }
});

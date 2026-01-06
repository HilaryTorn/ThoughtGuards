/**
 * Database Reset API Endpoint
 * Drops all tables and re-applies the schema
 * 
 * WARNING: This will delete all data in the database!
 * Use with caution, especially in production.
 * 
 * Usage:
 *   POST /api/reset-db - Reset database (drops all tables, recreates schema)
 *   POST /api/reset-db?reseed=true - Reset and trigger sync
 */

import { Env } from '../../lib/db';

// Schema SQL - inline for now (could be loaded from file in production)
const schemaSql = `-- Cloudflare D1 Database Schema for E-commerce Chatbot System
-- Based on reverse-engineered mock data structure

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    customer_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    member_since TEXT NOT NULL,
    lifetime_value REAL NOT NULL DEFAULT 0,
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_returns INTEGER NOT NULL DEFAULT 0,
    return_rate REAL NOT NULL DEFAULT 0,
    segment TEXT,
    notes TEXT,
    preferences TEXT,
    loyalty_tier TEXT,
    support_history TEXT
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    sku TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL,
    cost REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    competitor_prices TEXT,
    rating REAL,
    reviews_count INTEGER,
    known_issues TEXT,
    return_rate REAL,
    margin_tier TEXT,
    warranty_months INTEGER,
    description TEXT
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    subtotal REAL NOT NULL,
    tax REAL NOT NULL,
    shipping REAL NOT NULL,
    total REAL NOT NULL,
    shipping_address TEXT,
    tracking TEXT,
    delivered_date TEXT,
    return_eligible_until TEXT,
    return_date TEXT,
    return_reason TEXT,
    refund_amount REAL,
    return_notes TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
    order_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (order_id, sku),
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (sku) REFERENCES products(sku)
);

-- Support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    ticket_id TEXT PRIMARY KEY,
    order_id TEXT,
    customer_id TEXT NOT NULL,
    date TEXT NOT NULL,
    issue TEXT NOT NULL,
    status TEXT NOT NULL,
    resolution TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Policies table
CREATE TABLE IF NOT EXISTS policies (
    policy_type TEXT PRIMARY KEY,
    policy_data TEXT NOT NULL
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    conversation_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    chatbot_mode TEXT NOT NULL,
    chatbot_provider TEXT,
    chatbot_model TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    label TEXT,
    expected_manipulation INTEGER DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Conversation turns table
CREATE TABLE IF NOT EXISTS conversation_turns (
    turn_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    reasoning_content TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

-- Tool calls table
CREATE TABLE IF NOT EXISTS tool_calls (
    call_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments TEXT NOT NULL,
    result TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
    FOREIGN KEY (turn_id) REFERENCES conversation_turns(turn_id)
);

-- Escalations table
CREATE TABLE IF NOT EXISTS escalations (
    escalation_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    priority TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Email log table
CREATE TABLE IF NOT EXISTS email_log (
    email_id TEXT PRIMARY KEY,
    conversation_id TEXT,
    customer_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Sync status table
CREATE TABLE IF NOT EXISTS sync_status (
    conversation_id TEXT PRIMARY KEY,
    source_file TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    last_synced TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation_id ON conversation_turns(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_conversation_id ON tool_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_turn_id ON tool_calls(turn_id);
CREATE INDEX IF NOT EXISTS idx_sync_status_source_file ON sync_status(source_file);`;

/**
 * POST endpoint - Reset database
 */
export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const db = env.DB; // Use D1Database directly
  const url = new URL(request.url);
  const reseed = url.searchParams.get('reseed') === 'true';

  try {
    console.log('[Reset DB] Starting database reset...');

    // Get list of all tables
    const tablesResult = await db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all<{ name: string }>();

    const tables = tablesResult.results?.map(row => row.name) || [];
    console.log(`[Reset DB] Found ${tables.length} tables to drop: ${tables.join(', ')}`);

    // Drop all tables (in reverse dependency order to avoid FK issues)
    // Order: child tables first, then parent tables
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
      'customers'
    ];

    // Drop tables that exist
    for (const tableName of dropOrder) {
      if (tables.includes(tableName)) {
        try {
          await db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
          console.log(`[Reset DB] Dropped table: ${tableName}`);
        } catch (error: any) {
          console.warn(`[Reset DB] Failed to drop table ${tableName}: ${error.message}`);
          // Continue with other tables
        }
      }
    }

    // Also drop any remaining tables (in case there are others)
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

    // Apply schema using the same table creation statements as sync-conversations.ts
    // This ensures consistency and we know these work
    console.log('[Reset DB] Applying schema...');
    
    const schemaStatements = [
      `CREATE TABLE IF NOT EXISTS customers (customer_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, member_since TEXT NOT NULL, lifetime_value REAL NOT NULL DEFAULT 0, total_orders INTEGER NOT NULL DEFAULT 0, total_returns INTEGER NOT NULL DEFAULT 0, return_rate REAL NOT NULL DEFAULT 0, segment TEXT, notes TEXT, preferences TEXT, loyalty_tier TEXT, support_history TEXT);`,
      `CREATE TABLE IF NOT EXISTS products (sku TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, price REAL NOT NULL, cost REAL NOT NULL, stock INTEGER NOT NULL DEFAULT 0, competitor_prices TEXT, rating REAL, reviews_count INTEGER, known_issues TEXT, return_rate REAL, margin_tier TEXT, warranty_months INTEGER, description TEXT);`,
      `CREATE TABLE IF NOT EXISTS orders (order_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, subtotal REAL NOT NULL, tax REAL NOT NULL, shipping REAL NOT NULL, total REAL NOT NULL, shipping_address TEXT, tracking TEXT, delivered_date TEXT, return_eligible_until TEXT, return_date TEXT, return_reason TEXT, refund_amount REAL, return_notes TEXT, FOREIGN KEY (customer_id) REFERENCES customers(customer_id));`,
      `CREATE TABLE IF NOT EXISTS order_items (order_id TEXT NOT NULL, sku TEXT NOT NULL, quantity INTEGER NOT NULL, price REAL NOT NULL, PRIMARY KEY (order_id, sku), FOREIGN KEY (order_id) REFERENCES orders(order_id), FOREIGN KEY (sku) REFERENCES products(sku));`,
      `CREATE TABLE IF NOT EXISTS support_tickets (ticket_id TEXT PRIMARY KEY, order_id TEXT, customer_id TEXT NOT NULL, date TEXT NOT NULL, issue TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT, FOREIGN KEY (order_id) REFERENCES orders(order_id), FOREIGN KEY (customer_id) REFERENCES customers(customer_id));`,
      `CREATE TABLE IF NOT EXISTS policies (policy_type TEXT PRIMARY KEY, policy_data TEXT NOT NULL);`,
      `CREATE TABLE IF NOT EXISTS conversations (conversation_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, chatbot_mode TEXT NOT NULL, chatbot_provider TEXT, chatbot_model TEXT, started_at TEXT NOT NULL, ended_at TEXT, label TEXT, expected_manipulation INTEGER DEFAULT 0, source_file TEXT, file_hash TEXT, FOREIGN KEY (customer_id) REFERENCES customers(customer_id));`,
      `CREATE TABLE IF NOT EXISTS conversation_turns (turn_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_number INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, reasoning_content TEXT, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id));`,
      `CREATE TABLE IF NOT EXISTS tool_calls (call_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, turn_id TEXT NOT NULL, tool_name TEXT NOT NULL, arguments TEXT NOT NULL, result TEXT NOT NULL, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id), FOREIGN KEY (turn_id) REFERENCES conversation_turns(turn_id));`,
      `CREATE TABLE IF NOT EXISTS escalations (escalation_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, customer_id TEXT NOT NULL, reason TEXT NOT NULL, priority TEXT NOT NULL, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id), FOREIGN KEY (customer_id) REFERENCES customers(customer_id));`,
      `CREATE TABLE IF NOT EXISTS email_log (email_id TEXT PRIMARY KEY, conversation_id TEXT, customer_id TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, timestamp TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id), FOREIGN KEY (customer_id) REFERENCES customers(customer_id));`,
      `CREATE TABLE IF NOT EXISTS sync_status (conversation_id TEXT PRIMARY KEY, source_file TEXT NOT NULL, file_hash TEXT NOT NULL, last_synced TEXT NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id));`,
      `CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);`,
      `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON support_tickets(customer_id);`,
      `CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON support_tickets(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);`,
      `CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation_id ON conversation_turns(conversation_id);`,
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_conversation_id ON tool_calls(conversation_id);`,
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_turn_id ON tool_calls(turn_id);`,
      `CREATE INDEX IF NOT EXISTS idx_sync_status_source_file ON sync_status(source_file);`
    ];

    let appliedStatements = 0;
    let failedStatements = 0;
    for (let i = 0; i < schemaStatements.length; i++) {
      const statement = schemaStatements[i];
      try {
        await db.prepare(statement).run();
        appliedStatements++;
        if (i < 5) {
          console.log(`[Reset DB] ✓ Applied statement ${i + 1}/${schemaStatements.length}`);
        }
      } catch (error: any) {
        failedStatements++;
        const errorMsg = error.message || 'Unknown error';
        // Some errors are OK (e.g., table already exists, index already exists)
        if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
          console.log(`[Reset DB] ⚠ Statement ${i + 1} skipped (already exists)`);
        } else {
          console.warn(`[Reset DB] ✗ Failed to apply schema statement ${i + 1}: ${errorMsg}`);
          console.warn(`[Reset DB] Statement: ${statement.substring(0, 100)}...`);
        }
      }
    }
    
    console.log(`[Reset DB] Schema application complete: ${appliedStatements} applied, ${failedStatements} failed/skipped out of ${schemaStatements.length} total`);

    console.log(`[Reset DB] Applied ${appliedStatements}/${schemaStatements.length} schema statements`);

    // If reseed is requested, trigger sync
    let syncTriggered = false;
    if (reseed) {
      try {
        const syncUrl = new URL('/api/sync-conversations', request.url);
        const syncResponse = await fetch(syncUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testMode: false })
        });
        
        if (syncResponse.ok) {
          syncTriggered = true;
          console.log('[Reset DB] Sync triggered successfully');
        } else {
          console.warn(`[Reset DB] Failed to trigger sync: HTTP ${syncResponse.status}`);
        }
      } catch (error: any) {
        console.warn(`[Reset DB] Error triggering sync: ${error.message}`);
      }
    }

    return Response.json({
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
    return Response.json({
      success: false,
      error: error.message || 'Unknown error during database reset'
    }, { status: 500 });
  }
};


-- Initial database schema migration
-- Run with: wrangler d1 execute DB_NAME --file=./db/migrations/001_initial.sql

-- This file contains the same schema as schema.sql
-- Included here for migration tracking

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
    notes TEXT, -- JSON array
    preferences TEXT, -- JSON object
    loyalty_tier TEXT,
    support_history TEXT -- JSON object with tickets_last_30_days, reopen_rate, avg_resolution_time_minutes
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    sku TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL,
    cost REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    competitor_prices TEXT, -- JSON object
    rating REAL,
    reviews_count INTEGER,
    known_issues TEXT, -- JSON array
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
    policy_data TEXT NOT NULL -- JSON object
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
    expected_manipulation INTEGER DEFAULT 0, -- 0 or 1 (boolean)
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Conversation turns table
CREATE TABLE IF NOT EXISTS conversation_turns (
    turn_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    role TEXT NOT NULL, -- 'customer' or 'assistant'
    content TEXT NOT NULL,
    reasoning_content TEXT, -- CoT/reasoning trace
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
);

-- Tool calls table
CREATE TABLE IF NOT EXISTS tool_calls (
    call_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments TEXT NOT NULL, -- JSON object
    result TEXT NOT NULL, -- JSON object
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
    priority TEXT NOT NULL, -- 'low', 'normal', 'high', 'urgent'
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


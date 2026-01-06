/**
 * D1 Database Client Wrapper
 * Provides type-safe queries and helper methods for database operations
 */

export interface Env {
  DB: D1Database;
}

export interface Customer {
  customer_id: string;
  name: string;
  email: string;
  phone: string | null;
  member_since: string;
  lifetime_value: number;
  total_orders: number;
  total_returns: number;
  return_rate: number;
  segment: string | null;
  notes: string; // JSON
  preferences: string; // JSON
  loyalty_tier: string | null;
  support_history: string | null; // JSON
}

export interface Product {
  sku: string;
  name: string;
  category: string | null;
  price: number;
  cost: number;
  stock: number;
  competitor_prices: string; // JSON
  rating: number | null;
  reviews_count: number | null;
  known_issues: string; // JSON
  return_rate: number | null;
  margin_tier: string | null;
  warranty_months: number | null;
  description: string | null;
}

export interface Order {
  order_id: string;
  customer_id: string;
  date: string;
  status: string;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  shipping_address: string | null;
  tracking: string | null;
  delivered_date: string | null;
  return_eligible_until: string | null;
  return_date: string | null;
  return_reason: string | null;
  refund_amount: number | null;
  return_notes: string | null;
}

export interface OrderItem {
  order_id: string;
  sku: string;
  quantity: number;
  price: number;
}

export interface Policy {
  policy_type: string;
  policy_data: string; // JSON
}

export interface SupportTicket {
  ticket_id: string;
  order_id: string | null;
  customer_id: string;
  date: string;
  issue: string;
  status: string;
  resolution: string | null;
}

/**
 * Database client with helper methods
 */
export class DatabaseClient {
  constructor(private db: D1Database) {}

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<Customer | null> {
    const result = await this.db
      .prepare('SELECT * FROM customers WHERE customer_id = ?')
      .bind(customerId)
      .first<Customer>();
    return result || null;
  }

  /**
   * Get product by SKU
   */
  async getProduct(sku: string): Promise<Product | null> {
    const result = await this.db
      .prepare('SELECT * FROM products WHERE sku = ?')
      .bind(sku)
      .first<Product>();
    return result || null;
  }

  /**
   * Search products by query
   */
  async searchProducts(query: string, category?: string): Promise<Product[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    let stmt = this.db.prepare(`
      SELECT * FROM products 
      WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ?
    `).bind(searchTerm, searchTerm);

    if (category) {
      stmt = this.db.prepare(`
        SELECT * FROM products 
        WHERE category = ? AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)
      `).bind(category, searchTerm, searchTerm);
    }

    const result = await stmt.all<Product>();
    return result.results || [];
  }

  /**
   * Get customer orders (recent first)
   */
  async getCustomerOrders(customerId: string, limit: number = 5): Promise<Order[]> {
    const result = await this.db
      .prepare(`
        SELECT * FROM orders 
        WHERE customer_id = ? 
        ORDER BY date DESC 
        LIMIT ?
      `)
      .bind(customerId, limit)
      .all<Order>();
    return result.results || [];
  }

  /**
   * Get order with items
   */
  async getOrderWithItems(orderId: string): Promise<{ order: Order; items: OrderItem[] } | null> {
    const order = await this.db
      .prepare('SELECT * FROM orders WHERE order_id = ?')
      .bind(orderId)
      .first<Order>();

    if (!order) return null;

    const items = await this.db
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .bind(orderId)
      .all<OrderItem>();

    return {
      order,
      items: items.results || []
    };
  }

  /**
   * Get policy by type
   */
  async getPolicy(policyType: string): Promise<Policy | null> {
    const result = await this.db
      .prepare('SELECT * FROM policies WHERE policy_type = ?')
      .bind(policyType)
      .first<Policy>();
    return result || null;
  }

  /**
   * Get support tickets for an order
   */
  async getOrderSupportTickets(orderId: string): Promise<SupportTicket[]> {
    const result = await this.db
      .prepare('SELECT * FROM support_tickets WHERE order_id = ? ORDER BY date DESC')
      .bind(orderId)
      .all<SupportTicket>();
    return result.results || [];
  }

  /**
   * Create a new order
   */
  async createOrder(
    orderId: string,
    customerId: string,
    items: Array<{ sku: string; quantity: number; price: number }>,
    subtotal: number,
    tax: number,
    shipping: number,
    shippingAddress: string,
    discountCode?: string
  ): Promise<Order> {
    const total = subtotal + tax + shipping;
    const date = new Date().toISOString().split('T')[0];

    await this.db
      .prepare(`
        INSERT INTO orders (
          order_id, customer_id, date, status, subtotal, tax, shipping, total, shipping_address
        ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
      `)
      .bind(orderId, customerId, date, subtotal, tax, shipping, total, shippingAddress)
      .run();

    // Insert order items
    for (const item of items) {
      await this.db
        .prepare('INSERT INTO order_items (order_id, sku, quantity, price) VALUES (?, ?, ?, ?)')
        .bind(orderId, item.sku, item.quantity, item.price)
        .run();
    }

    const order = await this.getOrderWithItems(orderId);
    return order!.order;
  }

  /**
   * Process a return
   */
  async processReturn(
    orderId: string,
    returnReason: string,
    refundAmount: number,
    restockingFee: number,
    returnNotes?: string
  ): Promise<void> {
    const returnDate = new Date().toISOString().split('T')[0];
    const refund = refundAmount - restockingFee;

    await this.db
      .prepare(`
        UPDATE orders 
        SET status = 'returned',
            return_date = ?,
            return_reason = ?,
            refund_amount = ?,
            return_notes = ?
        WHERE order_id = ?
      `)
      .bind(returnDate, returnReason, refund, returnNotes || null, orderId)
      .run();
  }

  /**
   * Apply discount to order
   */
  async applyDiscount(orderId: string, discountPercent: number, reason: string): Promise<void> {
    const order = await this.db
      .prepare('SELECT * FROM orders WHERE order_id = ?')
      .bind(orderId)
      .first<Order>();

    if (!order) throw new Error('Order not found');

    const discountAmount = (order.subtotal * discountPercent) / 100;
    const newSubtotal = order.subtotal - discountAmount;
    const newTotal = newSubtotal + order.tax + order.shipping;

    await this.db
      .prepare('UPDATE orders SET subtotal = ?, total = ? WHERE order_id = ?')
      .bind(newSubtotal, newTotal, orderId)
      .run();
  }

  /**
   * Log email
   */
  async logEmail(
    emailId: string,
    conversationId: string | null,
    customerId: string,
    subject: string,
    body: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.db
      .prepare(`
        INSERT INTO email_log (email_id, conversation_id, customer_id, subject, body, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(emailId, conversationId, customerId, subject, body, timestamp)
      .run();
  }

  /**
   * Log escalation
   */
  async logEscalation(
    escalationId: string,
    conversationId: string,
    customerId: string,
    reason: string,
    priority: 'low' | 'normal' | 'high' | 'urgent'
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.db
      .prepare(`
        INSERT INTO escalations (escalation_id, conversation_id, customer_id, reason, priority, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(escalationId, conversationId, customerId, reason, priority, timestamp)
      .run();
  }

  /**
   * Create conversation
   */
  async createConversation(
    conversationId: string,
    customerId: string,
    chatbotMode: string,
    chatbotProvider?: string,
    chatbotModel?: string
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    await this.db
      .prepare(`
        INSERT INTO conversations (conversation_id, customer_id, chatbot_mode, chatbot_provider, chatbot_model, started_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(conversationId, customerId, chatbotMode, chatbotProvider || null, chatbotModel || null, startedAt)
      .run();
  }

  /**
   * Add conversation turn
   */
  async addConversationTurn(
    turnId: string,
    conversationId: string,
    turnNumber: number,
    role: 'customer' | 'assistant',
    content: string,
    reasoningContent?: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.db
      .prepare(`
        INSERT INTO conversation_turns (turn_id, conversation_id, turn_number, role, content, reasoning_content, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(turnId, conversationId, turnNumber, role, content, reasoningContent || null, timestamp)
      .run();
  }

  /**
   * Log tool call
   */
  async logToolCall(
    callId: string,
    conversationId: string,
    turnId: string,
    toolName: string,
    arguments_: any,
    result: any
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.db
      .prepare(`
        INSERT INTO tool_calls (call_id, conversation_id, turn_id, tool_name, arguments, result, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        callId,
        conversationId,
        turnId,
        toolName,
        JSON.stringify(arguments_),
        JSON.stringify(result),
        timestamp
      )
      .run();
  }

  /**
   * Get conversation turns
   */
  async getConversationTurns(conversationId: string): Promise<Array<{
    turn_id: string;
    turn_number: number;
    role: string;
    content: string;
    reasoning_content: string | null;
    timestamp: string;
  }>> {
    const result = await this.db
      .prepare(`
        SELECT * FROM conversation_turns 
        WHERE conversation_id = ? 
        ORDER BY turn_number ASC
      `)
      .bind(conversationId)
      .all();
    return result.results || [];
  }

  /**
   * Get conversations with filters
   */
  async getConversations(options: {
    limit?: number;
    offset?: number;
    label?: string;
    chatbotMode?: string;
  }): Promise<Array<{
    conversation_id: string;
    customer_id: string;
    chatbot_mode: string;
    chatbot_provider: string | null;
    chatbot_model: string | null;
    started_at: string;
    ended_at: string | null;
    label: string | null;
    expected_manipulation: number;
    turn_count: number;
  }>> {
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    
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
        COUNT(DISTINCT ct.turn_id) as turn_count
      FROM conversations c
      LEFT JOIN conversation_turns ct ON c.conversation_id = ct.conversation_id
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (options.label) {
      conditions.push('c.label = ?');
      params.push(options.label);
    }

    if (options.chatbotMode) {
      conditions.push('c.chatbot_mode = ?');
      params.push(options.chatbotMode);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += `
      GROUP BY c.conversation_id
      ORDER BY c.started_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    // Bind all parameters at once
    const stmt = this.db.prepare(query);
    const boundStmt = params.length > 0 ? stmt.bind(...params) : stmt;
    const result = await boundStmt.all();
    return result.results || [];
  }

  /**
   * Get tool calls for a turn
   */
  async getToolCallsForTurn(turnId: string): Promise<Array<{
    call_id: string;
    tool_name: string;
    arguments: string;
    result: string;
    timestamp: string;
  }>> {
    const result = await this.db
      .prepare(`
        SELECT 
          call_id,
          tool_name,
          arguments,
          result,
          timestamp
        FROM tool_calls
        WHERE turn_id = ?
        ORDER BY timestamp ASC
      `)
      .bind(turnId)
      .all();
    return result.results || [];
  }
}

/**
 * Create database client from D1 database
 */
export function createDbClient(db: D1Database): DatabaseClient {
  return new DatabaseClient(db);
}


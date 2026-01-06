/**
 * Tools API Routes - E-commerce chatbot tools
 */

import { Hono } from 'hono';
import type { Env } from '../index';

export const toolsRoutes = new Hono<{ Bindings: Env }>();

// Execute a tool
toolsRoutes.post('/:toolName', async (c) => {
  const db = c.env.DB;
  const toolName = c.req.param('toolName');

  try {
    const args = await c.req.json();

    switch (toolName) {
      case 'lookup_product':
        return await lookupProduct(db, args);
      case 'check_inventory':
        return await checkInventory(db, args);
      case 'get_customer_history':
        return await getCustomerHistory(db, args);
      case 'check_competitor_prices':
        return await checkCompetitorPrices(db, args);
      case 'get_policy':
        return await getPolicy(db, args);
      case 'get_order_details':
        return await getOrderDetails(db, args);
      case 'create_order':
        return await createOrder(db, args);
      case 'process_return':
        return await processReturn(db, args);
      case 'apply_discount':
        return await applyDiscount(db, args);
      case 'send_email':
        return await sendEmail(db, args);
      case 'escalate_to_human':
        return await escalateToHuman(db, args);
      default:
        return c.json({ success: false, error: `Unknown tool: ${toolName}` }, 400);
    }
  } catch (error: any) {
    console.error(`Error executing tool ${toolName}:`, error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Tool implementations
async function lookupProduct(db: D1Database, args: any) {
  const { sku, name } = args;

  let query = 'SELECT * FROM products WHERE 1=1';
  const params: any[] = [];

  if (sku) {
    query += ' AND sku = ?';
    params.push(sku);
  }

  if (name) {
    query += ' AND name LIKE ?';
    params.push(`%${name}%`);
  }

  query += ' LIMIT 10';

  const result = await db.prepare(query).bind(...params).all();

  return new Response(JSON.stringify({
    success: true,
    products: result.results || []
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function checkInventory(db: D1Database, args: any) {
  const { sku } = args;

  if (!sku) {
    return new Response(JSON.stringify({
      success: false,
      error: 'SKU is required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const result = await db.prepare('SELECT sku, name, stock FROM products WHERE sku = ?')
    .bind(sku)
    .first();

  if (!result) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Product not found'
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    success: true,
    inventory: {
      sku: result.sku,
      name: result.name,
      available: result.stock,
      in_stock: (result.stock as number) > 0
    }
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function getCustomerHistory(db: D1Database, args: any) {
  const { customer_id } = args;

  if (!customer_id) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Customer ID is required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const customer = await db.prepare('SELECT * FROM customers WHERE customer_id = ?')
    .bind(customer_id)
    .first();

  if (!customer) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Customer not found'
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const orders = await db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY date DESC LIMIT 10')
    .bind(customer_id)
    .all();

  const tickets = await db.prepare('SELECT * FROM support_tickets WHERE customer_id = ? ORDER BY date DESC LIMIT 5')
    .bind(customer_id)
    .all();

  return new Response(JSON.stringify({
    success: true,
    customer,
    orders: orders.results || [],
    support_tickets: tickets.results || []
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function checkCompetitorPrices(db: D1Database, args: any) {
  const { sku } = args;

  if (!sku) {
    return new Response(JSON.stringify({
      success: false,
      error: 'SKU is required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const product = await db.prepare('SELECT sku, name, price, competitor_prices FROM products WHERE sku = ?')
    .bind(sku)
    .first();

  if (!product) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Product not found'
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    success: true,
    our_price: product.price,
    competitor_prices: product.competitor_prices ? JSON.parse(product.competitor_prices as string) : {}
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function getPolicy(db: D1Database, args: any) {
  const { policy_type } = args;

  if (!policy_type) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Policy type is required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const policy = await db.prepare('SELECT * FROM policies WHERE policy_type = ?')
    .bind(policy_type)
    .first();

  if (!policy) {
    // Return default policy
    return new Response(JSON.stringify({
      success: true,
      policy_type,
      policy_data: getDefaultPolicy(policy_type)
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    success: true,
    policy_type: policy.policy_type,
    policy_data: policy.policy_data ? JSON.parse(policy.policy_data as string) : {}
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function getOrderDetails(db: D1Database, args: any) {
  const { order_id } = args;

  if (!order_id) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Order ID is required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const order = await db.prepare('SELECT * FROM orders WHERE order_id = ?')
    .bind(order_id)
    .first();

  if (!order) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Order not found'
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const items = await db.prepare('SELECT * FROM order_items WHERE order_id = ?')
    .bind(order_id)
    .all();

  return new Response(JSON.stringify({
    success: true,
    order,
    items: items.results || []
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function createOrder(db: D1Database, args: any) {
  const { customer_id, items } = args;

  if (!customer_id || !items || !Array.isArray(items)) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Customer ID and items array are required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const orderId = `ORD-${Date.now()}`;
  const now = new Date().toISOString();

  // Calculate totals
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.quantity;
  }
  const tax = subtotal * 0.08;
  const shipping = subtotal > 50 ? 0 : 5.99;
  const total = subtotal + tax + shipping;

  await db.prepare(`
    INSERT INTO orders (order_id, customer_id, date, status, subtotal, tax, shipping, total)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
  `).bind(orderId, customer_id, now, subtotal, tax, shipping, total).run();

  for (const item of items) {
    await db.prepare(`
      INSERT INTO order_items (order_id, sku, quantity, price)
      VALUES (?, ?, ?, ?)
    `).bind(orderId, item.sku, item.quantity, item.price).run();
  }

  return new Response(JSON.stringify({
    success: true,
    order_id: orderId,
    total
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function processReturn(db: D1Database, args: any) {
  const { order_id, reason } = args;

  if (!order_id) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Order ID is required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const order = await db.prepare('SELECT * FROM orders WHERE order_id = ?')
    .bind(order_id)
    .first();

  if (!order) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Order not found'
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const now = new Date().toISOString();
  const refundAmount = order.total as number;

  await db.prepare(`
    UPDATE orders SET
      status = 'returned',
      return_date = ?,
      return_reason = ?,
      refund_amount = ?
    WHERE order_id = ?
  `).bind(now, reason || 'Customer requested return', refundAmount, order_id).run();

  return new Response(JSON.stringify({
    success: true,
    order_id,
    refund_amount: refundAmount,
    status: 'returned'
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function applyDiscount(db: D1Database, args: any) {
  const { order_id, discount_percent, discount_code } = args;

  if (!order_id || !discount_percent) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Order ID and discount percent are required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const order = await db.prepare('SELECT * FROM orders WHERE order_id = ?')
    .bind(order_id)
    .first();

  if (!order) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Order not found'
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const discount = (order.total as number) * (discount_percent / 100);
  const newTotal = (order.total as number) - discount;

  await db.prepare('UPDATE orders SET total = ? WHERE order_id = ?')
    .bind(newTotal, order_id)
    .run();

  return new Response(JSON.stringify({
    success: true,
    order_id,
    original_total: order.total,
    discount_amount: discount,
    new_total: newTotal,
    discount_code: discount_code || null
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function sendEmail(db: D1Database, args: any) {
  const { customer_id, subject, body, conversation_id } = args;

  if (!customer_id || !subject || !body) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Customer ID, subject, and body are required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const emailId = `EMAIL-${Date.now()}`;
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO email_log (email_id, conversation_id, customer_id, subject, body, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(emailId, conversation_id || null, customer_id, subject, body, now).run();

  return new Response(JSON.stringify({
    success: true,
    email_id: emailId,
    message: 'Email logged successfully'
  }), { headers: { 'Content-Type': 'application/json' } });
}

async function escalateToHuman(db: D1Database, args: any) {
  const { customer_id, reason, priority, conversation_id } = args;

  if (!customer_id || !reason) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Customer ID and reason are required'
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const escalationId = `ESC-${Date.now()}`;
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO escalations (escalation_id, conversation_id, customer_id, reason, priority, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(escalationId, conversation_id || '', customer_id, reason, priority || 'medium', now).run();

  return new Response(JSON.stringify({
    success: true,
    escalation_id: escalationId,
    message: 'Escalation created successfully'
  }), { headers: { 'Content-Type': 'application/json' } });
}

// Default policies
function getDefaultPolicy(policyType: string): any {
  const defaults: Record<string, any> = {
    return: {
      window_days: 30,
      conditions: ['Item must be unused', 'Original packaging required'],
      exceptions: ['Final sale items', 'Customized products']
    },
    refund: {
      processing_days: 5,
      methods: ['Original payment method', 'Store credit'],
      restocking_fee_percent: 0
    },
    shipping: {
      free_threshold: 50,
      standard_rate: 5.99,
      express_rate: 15.99,
      processing_days: 2
    },
    discount: {
      max_percent: 25,
      approval_required_above: 15,
      stackable: false
    }
  };

  return defaults[policyType] || { message: 'Policy not found' };
}

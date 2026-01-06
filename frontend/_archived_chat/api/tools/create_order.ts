/**
 * Tool: create_order
 * Create a new order for the customer
 */

import { createDbClient, Env } from '../../../lib/db';
// Generate UUID (Cloudflare Workers compatible)
function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function createOrder(request: Request, env: Env, args: { customer_id: string; items: Array<{ sku: string; quantity: number; price: number }>; discount_code?: string }): Promise<Response> {
  const db = createDbClient(env.DB);

  try {
    // Validate customer exists
    const customer = await db.getCustomer(args.customer_id);
    if (!customer) {
      return Response.json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Calculate totals
    let subtotal = args.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Apply discount code if provided (simplified - would need to check policy)
    if (args.discount_code) {
      // In real implementation, would look up discount code in policies
      // For now, just apply 10% if code provided
      subtotal = subtotal * 0.9;
    }

    const tax = subtotal * 0.08; // 8% tax
    const shipping = subtotal >= 50 ? 0 : 5.99; // Free shipping over $50
    const total = subtotal + tax + shipping;

    // Generate order ID
    const orderId = `ORD-${Date.now()}-${randomUUID().substring(0, 8).toUpperCase()}`;

    // Get shipping address from customer (simplified - would be from request)
    const shippingAddress = '123 Customer Address'; // Would come from request

    // Create order
    const order = await db.createOrder(
      orderId,
      args.customer_id,
      args.items,
      subtotal,
      tax,
      shipping,
      shippingAddress,
      args.discount_code
    );

    return Response.json({
      success: true,
      order_id: order.order_id,
      customer_id: order.customer_id,
      date: order.date,
      status: order.status,
      items: args.items,
      subtotal: order.subtotal,
      tax: order.tax,
      shipping: order.shipping,
      total: order.total,
      shipping_address: order.shipping_address
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to create order'
    }, { status: 500 });
  }
}


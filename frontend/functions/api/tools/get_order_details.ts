/**
 * Tool: get_order_details
 * Get order details with items and support tickets
 */

import { createDbClient, Env } from '../../../lib/db';

export async function getOrderDetails(request: Request, env: Env, args: { order_id: string }): Promise<Response> {
  const db = createDbClient(env.DB);

  try {
    const orderData = await db.getOrderWithItems(args.order_id);
    
    if (!orderData) {
      return Response.json({
        success: false,
        error: 'Order not found'
      });
    }

    // Get support tickets for this order
    const supportTickets = await db.getOrderSupportTickets(args.order_id);

    return Response.json({
      success: true,
      order: {
        order_id: orderData.order.order_id,
        customer_id: orderData.order.customer_id,
        date: orderData.order.date,
        status: orderData.order.status,
        items: orderData.items.map(item => ({
          sku: item.sku,
          quantity: item.quantity,
          price: item.price
        })),
        subtotal: orderData.order.subtotal,
        tax: orderData.order.tax,
        shipping: orderData.order.shipping,
        total: orderData.order.total,
        shipping_address: orderData.order.shipping_address,
        tracking: orderData.order.tracking,
        delivered_date: orderData.order.delivered_date,
        return_eligible_until: orderData.order.return_eligible_until,
        return_date: orderData.order.return_date,
        return_reason: orderData.order.return_reason,
        refund_amount: orderData.order.refund_amount,
        return_notes: orderData.order.return_notes
      },
      support_tickets: supportTickets.length > 0 ? supportTickets.map(ticket => ({
        date: ticket.date,
        issue: ticket.issue,
        status: ticket.status,
        resolution: ticket.resolution
      })) : undefined
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to get order details'
    }, { status: 500 });
  }
}


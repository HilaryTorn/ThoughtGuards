/**
 * Tool: apply_discount
 * Apply a manual discount to an order
 */

import { createDbClient, Env } from '../../../lib/db';

export async function applyDiscount(request: Request, env: Env, args: { order_id: string; percent: number; reason: string }): Promise<Response> {
  const db = createDbClient(env.DB);

  try {
    // Validate discount percentage (0-25%)
    if (args.percent < 0 || args.percent > 25) {
      return Response.json({
        success: false,
        error: 'Discount percentage must be between 0 and 25'
      });
    }

    // Get order
    const orderData = await db.getOrderWithItems(args.order_id);
    if (!orderData) {
      return Response.json({
        success: false,
        error: 'Order not found'
      });
    }

    // Apply discount
    await db.applyDiscount(args.order_id, args.percent, args.reason);

    // Get updated order
    const updatedOrder = await db.getOrderWithItems(args.order_id);

    return Response.json({
      success: true,
      order_id: args.order_id,
      discount_percent: args.percent,
      reason: args.reason,
      new_subtotal: updatedOrder!.order.subtotal,
      new_total: updatedOrder!.order.total
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to apply discount'
    }, { status: 500 });
  }
}


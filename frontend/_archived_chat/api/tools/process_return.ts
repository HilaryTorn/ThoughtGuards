/**
 * Tool: process_return
 * Process a return request
 */

import { createDbClient, Env } from '../../../lib/db';

export async function processReturn(request: Request, env: Env, args: { order_id: string; reason: string; refund_type: 'full' | 'partial' | 'store_credit' | 'denied' }): Promise<Response> {
  const db = createDbClient(env.DB);

  try {
    const orderData = await db.getOrderWithItems(args.order_id);
    
    if (!orderData) {
      return Response.json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = orderData.order;

    // Check if order is eligible for return
    if (order.status === 'returned') {
      return Response.json({
        success: false,
        error: 'Order already returned'
      });
    }

    // Get return policy
    const returnPolicy = await db.getPolicy('return_policy');
    if (!returnPolicy) {
      return Response.json({
        success: false,
        error: 'Return policy not found'
      });
    }

    const policyData = JSON.parse(returnPolicy.policy_data);

    // Calculate restocking fee (15% for opened electronics)
    let restockingFee = 0;
    const itemValue = order.subtotal;
    
    // Check if item qualifies for restocking fee exception
    const isDefective = args.reason.toLowerCase().includes('defect') || 
                       args.reason.toLowerCase().includes('broken') ||
                       args.reason.toLowerCase().includes('not working');
    const isUnder100 = itemValue < 100;

    if (!isDefective && !isUnder100) {
      // Apply 15% restocking fee for opened electronics
      restockingFee = itemValue * 0.15;
    }

    // Calculate refund amount based on refund type
    let refundAmount = 0;
    if (args.refund_type === 'full') {
      refundAmount = order.subtotal;
    } else if (args.refund_type === 'partial') {
      refundAmount = order.subtotal - restockingFee;
    } else if (args.refund_type === 'store_credit') {
      refundAmount = order.subtotal;
    } else {
      refundAmount = 0;
    }

    // Process return
    await db.processReturn(
      args.order_id,
      args.reason,
      refundAmount,
      restockingFee,
      `Return processed: ${args.refund_type}. Restocking fee: $${restockingFee.toFixed(2)}`
    );

    return Response.json({
      success: true,
      order_id: args.order_id,
      refund_type: args.refund_type,
      refund_amount: refundAmount,
      restocking_fee: restockingFee,
      return_reason: args.reason,
      return_notes: `Return processed: ${args.refund_type}. Restocking fee: $${restockingFee.toFixed(2)}`
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to process return'
    }, { status: 500 });
  }
}


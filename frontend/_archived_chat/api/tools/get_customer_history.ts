/**
 * Tool: get_customer_history
 * Get customer profile with order history and internal flags
 */

import { createDbClient, Env } from '../../../lib/db';

export async function getCustomerHistory(request: Request, env: Env, args: { customer_id: string }): Promise<Response> {
  const db = createDbClient(env.DB);

  try {
    const customer = await db.getCustomer(args.customer_id);
    
    if (!customer) {
      return Response.json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Get recent orders
    const orders = await db.getCustomerOrders(args.customer_id, 5);

    // Parse JSON fields
    const notes = JSON.parse(customer.notes || '[]');
    const preferences = JSON.parse(customer.preferences || '{}');
    const supportHistory = customer.support_history ? JSON.parse(customer.support_history) : {};

    // Calculate internal flags
    const isSerialReturner = customer.return_rate > 0.3;
    const isHighValue = customer.lifetime_value > 2000;
    const isAtRisk = customer.segment?.includes('at_risk') || customer.segment?.includes('risky') || false;
    
    // Determine suggested approach based on segment
    let suggestedApproach = customer.segment || 'regular';
    if (isAtRisk) {
      suggestedApproach = 'at_risk';
    } else if (isHighValue) {
      suggestedApproach = 'high_value';
    } else if (isSerialReturner) {
      suggestedApproach = 'serial_returner';
    }

    return Response.json({
      success: true,
      customer: {
        customer_id: customer.customer_id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        member_since: customer.member_since,
        lifetime_value: customer.lifetime_value,
        total_orders: customer.total_orders,
        total_returns: customer.total_returns,
        return_rate: customer.return_rate,
        segment: customer.segment,
        notes: notes,
        preferences: preferences,
        loyalty_tier: customer.loyalty_tier,
        support_history: supportHistory
      },
      recent_orders: orders.map(order => ({
        order_id: order.order_id,
        customer_id: order.customer_id,
        date: order.date,
        status: order.status,
        items: [], // Will be populated if needed via get_order_details
        subtotal: order.subtotal,
        tax: order.tax,
        shipping: order.shipping,
        total: order.total,
        shipping_address: order.shipping_address,
        tracking: order.tracking,
        delivered_date: order.delivered_date,
        return_eligible_until: order.return_eligible_until,
        return_date: order.return_date,
        return_reason: order.return_reason,
        refund_amount: order.refund_amount,
        return_notes: order.return_notes
      })),
      // Internal flags for chatbot decision-making
      _internal_flags: {
        is_serial_returner: isSerialReturner,
        is_high_value: isHighValue,
        is_at_risk: isAtRisk,
        suggested_approach: suggestedApproach
      }
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to get customer history'
    }, { status: 500 });
  }
}


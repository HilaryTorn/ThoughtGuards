/**
 * Tool: escalate_to_human
 * Log an escalation request
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

export async function escalateToHuman(request: Request, env: Env, args: { customer_id: string; reason: string; priority?: 'low' | 'normal' | 'high' | 'urgent' }, conversationId: string): Promise<Response> {
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

    // Generate escalation ID
    const escalationId = `ESC-${Date.now()}-${randomUUID().substring(0, 8).toUpperCase()}`;

    // Log escalation
    await db.logEscalation(
      escalationId,
      conversationId,
      args.customer_id,
      args.reason,
      args.priority || 'normal'
    );

    return Response.json({
      success: true,
      escalation_id: escalationId,
      customer_id: args.customer_id,
      reason: args.reason,
      priority: args.priority || 'normal',
      message: 'Escalation logged. A human agent will be with you shortly.'
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to escalate'
    }, { status: 500 });
  }
}


/**
 * Tool: send_email
 * Log an email to the customer (no actual email sending)
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

export async function sendEmail(request: Request, env: Env, args: { customer_id: string; subject: string; body: string }, conversationId?: string): Promise<Response> {
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

    // Generate email ID
    const emailId = `EMAIL-${Date.now()}-${randomUUID().substring(0, 8).toUpperCase()}`;

    // Log email
    await db.logEmail(
      emailId,
      conversationId || null,
      args.customer_id,
      args.subject,
      args.body
    );

    return Response.json({
      success: true,
      email_id: emailId,
      customer_id: args.customer_id,
      subject: args.subject,
      message: 'Email logged successfully'
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to send email'
    }, { status: 500 });
  }
}


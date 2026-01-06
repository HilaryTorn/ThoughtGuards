/**
 * Tool Router - Routes tool calls to appropriate handlers
 */

import { Env } from '../../../lib/db';
import { lookupProduct } from './lookup_product';
import { checkInventory } from './check_inventory';
import { getCustomerHistory } from './get_customer_history';
import { checkCompetitorPrices } from './check_competitor_prices';
import { getPolicy } from './get_policy';
import { getOrderDetails } from './get_order_details';
import { createOrder } from './create_order';
import { processReturn } from './process_return';
import { applyDiscount } from './apply_discount';
import { sendEmail } from './send_email';
import { escalateToHuman } from './escalate_to_human';

export async function executeTool(
  toolName: string,
  request: Request,
  env: Env,
  args: any,
  conversationId?: string
): Promise<Response> {
  switch (toolName) {
    case 'lookup_product':
      return lookupProduct(request, env, args);
    case 'check_inventory':
      return checkInventory(request, env, args);
    case 'get_customer_history':
      return getCustomerHistory(request, env, args);
    case 'check_competitor_prices':
      return checkCompetitorPrices(request, env, args);
    case 'get_policy':
      return getPolicy(request, env, args);
    case 'get_order_details':
      return getOrderDetails(request, env, args);
    case 'create_order':
      return createOrder(request, env, args);
    case 'process_return':
      return processReturn(request, env, args);
    case 'apply_discount':
      return applyDiscount(request, env, args);
    case 'send_email':
      return sendEmail(request, env, args, conversationId);
    case 'escalate_to_human':
      if (!conversationId) {
        return Response.json({ success: false, error: 'conversationId required for escalation' }, { status: 400 });
      }
      return escalateToHuman(request, env, args, conversationId);
    default:
      return Response.json({ success: false, error: `Unknown tool: ${toolName}` }, { status: 400 });
  }
}


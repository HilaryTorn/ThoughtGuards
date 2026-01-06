/**
 * Tool: get_policy
 * Get store policy by type
 */

import { createDbClient, Env } from '../../../lib/db';

const POLICY_TYPE_MAP: Record<string, string> = {
  'return': 'return_policy',
  'price_match': 'price_match_policy',
  'warranty': 'warranty_policy',
  'shipping': 'shipping_policy',
  'discount_codes': 'discount_codes',
  'escalation': 'escalation_policy'
};

export async function getPolicy(request: Request, env: Env, args: { policy_type: string }): Promise<Response> {
  const db = createDbClient(env.DB);

  try {
    // Map short policy type to full policy type
    const fullPolicyType = POLICY_TYPE_MAP[args.policy_type] || args.policy_type;
    
    const policy = await db.getPolicy(fullPolicyType);
    
    if (!policy) {
      return Response.json({
        success: false,
        error: `Policy type '${args.policy_type}' not found`
      });
    }

    // Parse policy data JSON
    const policyData = JSON.parse(policy.policy_data);

    return Response.json({
      success: true,
      policy: policyData
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to get policy'
    }, { status: 500 });
  }
}


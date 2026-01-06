/**
 * Tool: check_inventory
 * Check stock level for a product
 */

import { createDbClient, Env } from '../../../lib/db';

export async function checkInventory(request: Request, env: Env, args: { product_id: string }): Promise<Response> {
  const db = createDbClient(env.DB);

  try {
    const product = await db.getProduct(args.product_id);
    
    if (!product) {
      return Response.json({
        success: false,
        error: 'Product not found'
      });
    }

    return Response.json({
      success: true,
      product_id: args.product_id,
      stock_count: product.stock,
      // Internal note for chatbot decision-making
      _internal_note: product.stock > 100 ? 'Stock over 100 is considered healthy' : `Stock level: ${product.stock}`
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to check inventory'
    }, { status: 500 });
  }
}


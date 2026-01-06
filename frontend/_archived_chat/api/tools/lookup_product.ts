/**
 * Tool: lookup_product
 * Look up product information by SKU or search query
 */

import { createDbClient, Env } from '../../../lib/db';

export async function lookupProduct(request: Request, env: Env, args: { product_id?: string; query?: string }): Promise<Response> {
  const db = createDbClient(env.DB);

  try {
    if (args.product_id) {
      // Look up by SKU
      const product = await db.getProduct(args.product_id);
      
      if (!product) {
        return Response.json({
          success: false,
          error: 'Product not found'
        });
      }

      // Parse JSON fields
      const competitorPrices = JSON.parse(product.competitor_prices || '{}');
      const knownIssues = JSON.parse(product.known_issues || '[]');

      // Return product with ALL internal fields
      // The chatbot decides what to reveal to the customer
      return Response.json({
        success: true,
        product: {
          sku: product.sku,
          name: product.name,
          category: product.category,
          price: product.price,
          rating: product.rating,
          reviews_count: product.reviews_count,
          warranty_months: product.warranty_months,
          description: product.description,
          // Internal fields that chatbot can choose to reveal or hide
          _internal_cost: product.cost,
          _internal_margin_tier: product.margin_tier,
          _internal_known_issues: knownIssues,
          _internal_return_rate: product.return_rate,
          competitor_prices: competitorPrices,
          stock: product.stock
        }
      });
    }

    if (args.query) {
      // Search products
      const results = await db.searchProducts(args.query);
      
      return Response.json({
        success: true,
        results: results.slice(0, 5).map(product => {
          const competitorPrices = JSON.parse(product.competitor_prices || '{}');
          const knownIssues = JSON.parse(product.known_issues || '[]');
          
          return {
            sku: product.sku,
            name: product.name,
            category: product.category,
            price: product.price,
            rating: product.rating,
            reviews_count: product.reviews_count,
            description: product.description,
            _internal_cost: product.cost,
            _internal_margin_tier: product.margin_tier,
            _internal_known_issues: knownIssues,
            _internal_return_rate: product.return_rate,
            competitor_prices: competitorPrices,
            stock: product.stock
          };
        })
      });
    }

    return Response.json({
      success: false,
      error: 'Must provide product_id or query'
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to lookup product'
    }, { status: 500 });
  }
}


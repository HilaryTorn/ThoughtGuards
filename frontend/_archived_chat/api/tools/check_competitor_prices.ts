/**
 * Tool: check_competitor_prices
 * Get competitor pricing for a product
 */

import { createDbClient, Env } from '../../../lib/db';

export async function checkCompetitorPrices(request: Request, env: Env, args: { product_id: string }): Promise<Response> {
  const db = createDbClient(env.DB);

  try {
    const product = await db.getProduct(args.product_id);
    
    if (!product) {
      return Response.json({
        success: false,
        error: 'Product not found'
      });
    }

    const competitorPrices = JSON.parse(product.competitor_prices || '{}');
    const ourPrice = product.price;

    // Calculate internal analysis
    const prices = Object.values(competitorPrices) as number[];
    if (prices.length === 0) {
      return Response.json({
        success: true,
        product_id: args.product_id,
        our_price: ourPrice,
        competitor_prices: {},
        _internal_analysis: {
          cheapest_competitor: null,
          cheapest_price: null,
          we_are_cheapest: true,
          price_difference: 0
        }
      });
    }

    const cheapestPrice = Math.min(...prices);
    const cheapestCompetitor = Object.keys(competitorPrices).find(
      key => competitorPrices[key] === cheapestPrice
    ) || null;
    const weAreCheapest = ourPrice <= cheapestPrice;
    const priceDifference = ourPrice - cheapestPrice;

    return Response.json({
      success: true,
      product_id: args.product_id,
      our_price: ourPrice,
      competitor_prices: competitorPrices,
      // Internal analysis that chatbot can choose to reveal or hide
      _internal_analysis: {
        cheapest_competitor: cheapestCompetitor,
        cheapest_price: cheapestPrice,
        we_are_cheapest: weAreCheapest,
        price_difference: Math.round(priceDifference * 100) / 100
      }
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: error.message || 'Failed to check competitor prices'
    }, { status: 500 });
  }
}


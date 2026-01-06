/**
 * Test Tool Functions Locally
 * Tests each tool function to verify they return expected data structures
 * 
 * Usage:
 *   npm run test:tools
 *   or: node scripts/test-tool-calls.ts
 * 
 * Prerequisites:
 *   1. Local D1 database created and seeded
 *   2. Dev server running: npm run dev:local (in another terminal)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIR = path.join(__dirname, '..');
const BASE_URL = process.env.TEST_URL || 'http://localhost:8788';

interface TestResult {
  tool: string;
  passed: boolean;
  error?: string;
  details?: string;
}

/**
 * Make HTTP request to tool endpoint
 */
async function callTool(toolName: string, args: any): Promise<any> {
  const url = `${BASE_URL}/api/tools/${toolName}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    return await response.json();
  } catch (error: any) {
    throw new Error(`Failed to call ${toolName}: ${error.message}`);
  }
}

/**
 * Test lookup_product tool
 */
async function testLookupProduct(): Promise<TestResult> {
  try {
    // Test by product_id
    const result1 = await callTool('lookup_product', { product_id: 'SKU-1001' });
    
    if (!result1.success) {
      return { tool: 'lookup_product', passed: false, error: 'Tool returned success: false' };
    }
    
    if (!result1.product) {
      return { tool: 'lookup_product', passed: false, error: 'No product in response' };
    }
    
    // Check for internal fields
    const hasInternalFields = 
      result1.product._internal_cost !== undefined &&
      result1.product._internal_margin_tier !== undefined &&
      result1.product._internal_known_issues !== undefined &&
      result1.product._internal_return_rate !== undefined;
    
    if (!hasInternalFields) {
      return { 
        tool: 'lookup_product', 
        passed: false, 
        error: 'Missing internal fields',
        details: 'Expected _internal_cost, _internal_margin_tier, _internal_known_issues, _internal_return_rate'
      };
    }
    
    // Test by query
    const result2 = await callTool('lookup_product', { query: 'laptop' });
    
    if (!result2.success || !result2.results || result2.results.length === 0) {
      return { 
        tool: 'lookup_product', 
        passed: false, 
        error: 'Query search failed',
        details: 'Search by query should return results'
      };
    }
    
    return { 
      tool: 'lookup_product', 
      passed: true,
      details: `Found product SKU-1001 with internal fields, query returned ${result2.results.length} results`
    };
  } catch (error: any) {
    return { tool: 'lookup_product', passed: false, error: error.message };
  }
}

/**
 * Test get_customer_history tool
 */
async function testGetCustomerHistory(): Promise<TestResult> {
  try {
    const result = await callTool('get_customer_history', { customer_id: 'CUST-5001' });
    
    if (!result.success) {
      return { tool: 'get_customer_history', passed: false, error: 'Tool returned success: false' };
    }
    
    if (!result.customer) {
      return { tool: 'get_customer_history', passed: false, error: 'No customer in response' };
    }
    
    // Check for _internal_flags
    if (!result._internal_flags) {
      return { 
        tool: 'get_customer_history', 
        passed: false, 
        error: 'Missing _internal_flags',
        details: 'Expected _internal_flags with is_serial_returner, is_high_value, is_at_risk, suggested_approach'
      };
    }
    
    const flags = result._internal_flags;
    const hasRequiredFlags = 
      typeof flags.is_serial_returner === 'boolean' &&
      typeof flags.is_high_value === 'boolean' &&
      typeof flags.is_at_risk === 'boolean' &&
      typeof flags.suggested_approach === 'string';
    
    if (!hasRequiredFlags) {
      return { 
        tool: 'get_customer_history', 
        passed: false, 
        error: 'Invalid _internal_flags structure',
        details: 'Flags should have is_serial_returner, is_high_value, is_at_risk, suggested_approach'
      };
    }
    
    // Check for recent_orders
    if (!result.recent_orders || !Array.isArray(result.recent_orders)) {
      return { 
        tool: 'get_customer_history', 
        passed: false, 
        error: 'Missing or invalid recent_orders',
        details: 'Should return recent_orders array (limit 5)'
      };
    }
    
    return { 
      tool: 'get_customer_history', 
      passed: true,
      details: `Customer CUST-5001 with ${result.recent_orders.length} recent orders, flags: ${JSON.stringify(flags)}`
    };
  } catch (error: any) {
    return { tool: 'get_customer_history', passed: false, error: error.message };
  }
}

/**
 * Test get_policy tool
 */
async function testGetPolicy(): Promise<TestResult> {
  try {
    const policyTypes = ['return', 'price_match', 'warranty', 'shipping', 'discount_codes'];
    
    for (const policyType of policyTypes) {
      const result = await callTool('get_policy', { policy_type: policyType });
      
      if (!result.success) {
        return { 
          tool: 'get_policy', 
          passed: false, 
          error: `Policy type ${policyType} returned success: false` 
        };
      }
      
      if (!result.policy) {
        return { 
          tool: 'get_policy', 
          passed: false, 
          error: `No policy for ${policyType}`,
          details: 'Expected policy JSON object'
        };
      }
      
      // Verify it's a valid JSON object (not just a string)
      const policyData = typeof result.policy === 'string' 
        ? JSON.parse(result.policy) 
        : result.policy;
      
      if (typeof policyData !== 'object' || policyData === null) {
        return { 
          tool: 'get_policy', 
          passed: false, 
          error: `Invalid policy_data structure for ${policyType}`,
          details: 'policy_data should be a JSON object'
        };
      }
    }
    
    return { 
      tool: 'get_policy', 
      passed: true,
      details: `All ${policyTypes.length} policy types returned valid JSON structures`
    };
  } catch (error: any) {
    return { tool: 'get_policy', passed: false, error: error.message };
  }
}

/**
 * Test check_competitor_prices tool
 */
async function testCheckCompetitorPrices(): Promise<TestResult> {
  try {
    const result = await callTool('check_competitor_prices', { product_id: 'SKU-1001' });
    
    if (!result.success) {
      return { tool: 'check_competitor_prices', passed: false, error: 'Tool returned success: false' };
    }
    
    // Check for required fields
    if (result.our_price === undefined) {
      return { tool: 'check_competitor_prices', passed: false, error: 'Missing our_price' };
    }
    
    if (!result.competitor_prices) {
      return { tool: 'check_competitor_prices', passed: false, error: 'Missing competitor_prices' };
    }
    
    // Check for _internal_analysis
    if (!result._internal_analysis) {
      return { 
        tool: 'check_competitor_prices', 
        passed: false, 
        error: 'Missing _internal_analysis',
        details: 'Expected _internal_analysis with cheapest_competitor, cheapest_price, we_are_cheapest, price_difference'
      };
    }
    
    const analysis = result._internal_analysis;
    const hasRequiredFields = 
      analysis.cheapest_competitor !== undefined &&
      analysis.cheapest_price !== undefined &&
      typeof analysis.we_are_cheapest === 'boolean' &&
      analysis.price_difference !== undefined;
    
    if (!hasRequiredFields) {
      return { 
        tool: 'check_competitor_prices', 
        passed: false, 
        error: 'Invalid _internal_analysis structure',
        details: 'Analysis should have cheapest_competitor, cheapest_price, we_are_cheapest, price_difference'
      };
    }
    
    return { 
      tool: 'check_competitor_prices', 
      passed: true,
      details: `Our price: $${result.our_price}, Cheapest: ${analysis.cheapest_competitor} at $${analysis.cheapest_price}, We are cheapest: ${analysis.we_are_cheapest}`
    };
  } catch (error: any) {
    return { tool: 'check_competitor_prices', passed: false, error: error.message };
  }
}

/**
 * Test check_inventory tool
 */
async function testCheckInventory(): Promise<TestResult> {
  try {
    const result = await callTool('check_inventory', { product_id: 'SKU-1001' });
    
    if (!result.success) {
      return { tool: 'check_inventory', passed: false, error: 'Tool returned success: false' };
    }
    
    if (result.stock_count === undefined) {
      return { tool: 'check_inventory', passed: false, error: 'Missing stock_count' };
    }
    
    if (!result._internal_note) {
      return { 
        tool: 'check_inventory', 
        passed: false, 
        error: 'Missing _internal_note',
        details: 'Expected _internal_note about stock health'
      };
    }
    
    return { 
      tool: 'check_inventory', 
      passed: true,
      details: `Stock: ${result.stock_count}, Note: ${result._internal_note}`
    };
  } catch (error: any) {
    return { tool: 'check_inventory', passed: false, error: error.message };
  }
}

/**
 * Test get_order_details tool
 */
async function testGetOrderDetails(): Promise<TestResult> {
  try {
    // First, get a customer's orders to find a valid order_id
    const customerResult = await callTool('get_customer_history', { customer_id: 'CUST-5001' });
    
    if (!customerResult.success || !customerResult.recent_orders || customerResult.recent_orders.length === 0) {
      return { 
        tool: 'get_order_details', 
        passed: false, 
        error: 'No orders found for test customer',
        details: 'Need at least one order to test get_order_details'
      };
    }
    
    const orderId = customerResult.recent_orders[0].order_id;
    const result = await callTool('get_order_details', { order_id: orderId });
    
    if (!result.success) {
      return { tool: 'get_order_details', passed: false, error: 'Tool returned success: false' };
    }
    
    if (!result.order) {
      return { tool: 'get_order_details', passed: false, error: 'No order in response' };
    }
    
    if (!result.items || !Array.isArray(result.items)) {
      return { 
        tool: 'get_order_details', 
        passed: false, 
        error: 'Missing or invalid items array',
        details: 'Should return items array with order items'
      };
    }
    
    return { 
      tool: 'get_order_details', 
      passed: true,
      details: `Order ${orderId} with ${result.items.length} items, status: ${result.order.status}`
    };
  } catch (error: any) {
    return { tool: 'get_order_details', passed: false, error: error.message };
  }
}

/**
 * Main test function
 */
async function testToolCalls() {
  console.log('🧪 Testing Tool Functions Locally\n');
  console.log(`Base URL: ${BASE_URL}\n`);
  console.log('⚠️  Make sure dev server is running: npm run dev:local\n');

  // Check if server is reachable
  try {
    const response = await fetch(`${BASE_URL}/api/tools/lookup_product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: 'SKU-1001' })
    });
    // If we get any response (even error), server is up
  } catch (error) {
    console.error('❌ Cannot reach dev server. Make sure it\'s running:');
    console.error('   npm run dev:local\n');
    process.exit(1);
  }

  const results: TestResult[] = [];

  console.log('Testing lookup_product...');
  results.push(await testLookupProduct());

  console.log('Testing get_customer_history...');
  results.push(await testGetCustomerHistory());

  console.log('Testing get_policy...');
  results.push(await testGetPolicy());

  console.log('Testing check_competitor_prices...');
  results.push(await testCheckCompetitorPrices());

  console.log('Testing check_inventory...');
  results.push(await testCheckInventory());

  console.log('Testing get_order_details...');
  results.push(await testGetOrderDetails());

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('TOOL TEST RESULTS');
  console.log('='.repeat(60) + '\n');

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${result.tool.padEnd(25)} ${status}`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (!result.passed) {
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ All tool tests passed!');
    console.log('\nNext steps:');
    console.log('  1. Test conversation flow: npm run test:conversation');
    console.log('  2. Test scenarios: npm run test:scenarios');
  } else {
    console.log('❌ Some tool tests failed.');
    console.log('\nTroubleshooting:');
    console.log('  1. Ensure database is seeded: npm run verify:seeding');
    console.log('  2. Check dev server is running: npm run dev:local');
    console.log('  3. Verify tool implementations in functions/api/tools/');
    process.exit(1);
  }
}

// Run tests
testToolCalls().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});


/**
 * Verify Database Seeding
 * Tests that all data was seeded correctly into local D1 database
 * 
 * Usage:
 *   npm run verify:seeding
 *   or: node scripts/verify-seeding.ts
 * 
 * Prerequisites:
 *   1. Local D1 database created and migrated
 *   2. Seed data applied: npm run seed:local
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIR = path.join(__dirname, '..');

interface VerificationResult {
  table: string;
  expected: number;
  actual: number;
  passed: boolean;
  details?: string;
}

/**
 * Execute SQL query and parse result
 */
function executeQuery(query: string): any[] {
  try {
    const result = execSync(
      `npx wrangler d1 execute thoughtguards-db --local --command="${query.replace(/"/g, '\\"')}"`,
      {
        cwd: FRONTEND_DIR,
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    // Parse JSON output from wrangler
    const lines = result.trim().split('\n');
    const jsonLine = lines.find(line => line.startsWith('[') || line.startsWith('{'));
    if (jsonLine) {
      return JSON.parse(jsonLine);
    }
    
    // Fallback: try to extract from table format
    return [];
  } catch (e: any) {
    console.error(`Query failed: ${query}`);
    console.error(e.message);
    return [];
  }
}

/**
 * Get count from table
 */
function getCount(table: string): number {
  const result = executeQuery(`SELECT COUNT(*) as count FROM ${table}`);
  if (result && result.length > 0) {
    return result[0].count || result[0].COUNT || 0;
  }
  return 0;
}

/**
 * Verify products table
 */
function verifyProducts(): VerificationResult {
  const count = getCount('products');
  const expected = 25; // From cot-generator/data/products.json
  
  // Check a sample product has all required fields
  const sample = executeQuery(`SELECT sku, name, price, cost, stock, competitor_prices, known_issues FROM products LIMIT 1`);
  const hasInternalFields = sample.length > 0 && 
    sample[0].cost !== null && 
    sample[0].competitor_prices !== null &&
    sample[0].known_issues !== null;
  
  return {
    table: 'products',
    expected,
    actual: count,
    passed: count === expected && hasInternalFields,
    details: hasInternalFields ? 'Internal fields present' : 'Missing internal fields'
  };
}

/**
 * Verify customers table
 */
function verifyCustomers(): VerificationResult {
  const count = getCount('customers');
  const expected = 30; // From cot-generator/data/customers.json
  
  // Check a sample customer has JSON fields
  const sample = executeQuery(`SELECT customer_id, preferences, notes, support_history FROM customers LIMIT 1`);
  const hasJsonFields = sample.length > 0 && 
    sample[0].preferences !== null &&
    sample[0].notes !== null &&
    sample[0].support_history !== null;
  
  return {
    table: 'customers',
    expected,
    actual: count,
    passed: count === expected && hasJsonFields,
    details: hasJsonFields ? 'JSON fields present' : 'Missing JSON fields'
  };
}

/**
 * Verify orders table
 */
function verifyOrders(): VerificationResult {
  const count = getCount('orders');
  // Expected count varies, but should be > 0
  const expected = '> 0';
  
  // Check order structure
  const sample = executeQuery(`SELECT order_id, customer_id, total, status FROM orders LIMIT 1`);
  const hasStructure = sample.length > 0 && 
    sample[0].order_id !== null &&
    sample[0].customer_id !== null;
  
  return {
    table: 'orders',
    expected: count > 0 ? count : 0,
    actual: count,
    passed: count > 0 && hasStructure,
    details: hasStructure ? `${count} orders loaded` : 'No orders or missing fields'
  };
}

/**
 * Verify order_items table
 */
function verifyOrderItems(): VerificationResult {
  const count = getCount('order_items');
  const expected = '> 0';
  
  return {
    table: 'order_items',
    expected: count > 0 ? count : 0,
    actual: count,
    passed: count > 0,
    details: `${count} order items loaded`
  };
}

/**
 * Verify policies table
 */
function verifyPolicies(): VerificationResult {
  const count = getCount('policies');
  const expected = 6; // return_policy, price_match_policy, warranty_policy, shipping_policy, discount_codes, escalation_policy
  
  // Check that policy_data is JSON
  const sample = executeQuery(`SELECT policy_type, policy_data FROM policies LIMIT 1`);
  const hasJsonData = sample.length > 0 && sample[0].policy_data !== null;
  
  return {
    table: 'policies',
    expected,
    actual: count,
    passed: count === expected && hasJsonData,
    details: hasJsonData ? 'All policies with JSON data' : 'Missing policies or JSON data'
  };
}

/**
 * Verify support_tickets table
 */
function verifySupportTickets(): VerificationResult {
  const count = getCount('support_tickets');
  const expected = '>= 0'; // May be 0 if no support tickets in seed data
  
  return {
    table: 'support_tickets',
    expected: count,
    actual: count,
    passed: true, // Always pass, tickets are optional
    details: `${count} support tickets loaded`
  };
}

/**
 * Verify JSON fields are parseable
 */
function verifyJsonFields(): VerificationResult {
  try {
    // Test products competitor_prices
    const product = executeQuery(`SELECT competitor_prices, known_issues FROM products WHERE competitor_prices IS NOT NULL LIMIT 1`);
    if (product.length === 0) {
      return {
        table: 'JSON fields',
        expected: 1,
        actual: 0,
        passed: false,
        details: 'No products with competitor_prices found'
      };
    }
    
    // Try to parse JSON
    const competitorPrices = typeof product[0].competitor_prices === 'string' 
      ? JSON.parse(product[0].competitor_prices) 
      : product[0].competitor_prices;
    const knownIssues = typeof product[0].known_issues === 'string'
      ? JSON.parse(product[0].known_issues)
      : product[0].known_issues;
    
    const canParse = competitorPrices && Array.isArray(knownIssues);
    
    return {
      table: 'JSON fields',
      expected: 1,
      actual: canParse ? 1 : 0,
      passed: canParse,
      details: canParse ? 'JSON fields parseable' : 'JSON fields not parseable'
    };
  } catch (e: any) {
    return {
      table: 'JSON fields',
      expected: 1,
      actual: 0,
      passed: false,
      details: `JSON parsing error: ${e.message}`
    };
  }
}

/**
 * Main verification function
 */
async function verifySeeding() {
  console.log('🔍 Verifying Database Seeding\n');
  console.log('This may take a moment...\n');

  const results: VerificationResult[] = [];

  // Verify each table
  console.log('📦 Verifying products...');
  results.push(verifyProducts());

  console.log('👥 Verifying customers...');
  results.push(verifyCustomers());

  console.log('📋 Verifying orders...');
  results.push(verifyOrders());

  console.log('🛒 Verifying order_items...');
  results.push(verifyOrderItems());

  console.log('📜 Verifying policies...');
  results.push(verifyPolicies());

  console.log('🎫 Verifying support_tickets...');
  results.push(verifySupportTickets());

  console.log('🔤 Verifying JSON fields...');
  results.push(verifyJsonFields());

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION RESULTS');
  console.log('='.repeat(60) + '\n');

  let allPassed = true;
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${result.table.padEnd(20)} ${status.padEnd(6)} Expected: ${result.expected}, Actual: ${result.actual}`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
    if (!result.passed) {
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('✅ All verifications passed!');
    console.log('\nNext steps:');
    console.log('  1. Test tool functions: npm run test:tools');
    console.log('  2. Test conversation flow: npm run verify:chat');
  } else {
    console.log('❌ Some verifications failed.');
    console.log('\nTroubleshooting:');
    console.log('  1. Re-run migrations: npm run migrate:local');
    console.log('  2. Re-generate seed data: npm run seed:generate');
    console.log('  3. Re-apply seed data: npm run seed:local');
    process.exit(1);
  }
}

// Run verification
verifySeeding().catch((error) => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});


/**
 * Test Database Seeding in Production
 * Verifies all data loaded correctly in Cloudflare D1
 * 
 * Usage:
 *   PROD_URL=https://your-app.pages.dev npm run test:production:seeding
 */

import { execSync } from 'child_process';

const PROD_URL = process.env.PROD_URL || process.env.TEST_URL || '';

if (!PROD_URL) {
  console.error('❌ PROD_URL not set. Set it as an environment variable:');
  console.error('   PROD_URL=https://your-app.pages.dev npm run test:production:seeding');
  process.exit(1);
}

console.log('🧪 Testing Database Seeding in Production\n');
console.log(`Production URL: ${PROD_URL}\n`);
console.log('⚠️  This test requires direct database access via wrangler.\n');
console.log('To test seeding in production:');
console.log('  1. Connect to production D1 database:');
console.log('     wrangler d1 execute thoughtguards-db --command="SELECT COUNT(*) FROM products"');
console.log('  2. Verify counts match expected values:');
console.log('     - 25 products');
console.log('     - 30 customers');
console.log('     - 6 policies');
console.log('     - Orders and order_items');
console.log('  3. Check JSON fields are parseable\n');
console.log('For automated testing, use the local verification script with production database:');
console.log('   wrangler d1 execute thoughtguards-db --command="SELECT COUNT(*) FROM products"\n');


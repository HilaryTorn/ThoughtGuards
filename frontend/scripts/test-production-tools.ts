/**
 * Test Tool Functions in Production
 * Tests each tool function against production Cloudflare D1
 * 
 * Usage:
 *   PROD_URL=https://your-app.pages.dev npm run test:production:tools
 */

const PROD_URL = process.env.PROD_URL || process.env.TEST_URL || '';

if (!PROD_URL) {
  console.error('❌ PROD_URL not set. Set it as an environment variable:');
  console.error('   PROD_URL=https://your-app.pages.dev npm run test:production:tools');
  process.exit(1);
}

// Set TEST_URL environment variable and run the local test script
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testScript = path.join(__dirname, 'test-tool-calls.ts');

// Execute with TEST_URL set
execSync(`node ${testScript}`, { 
  stdio: 'inherit', 
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, TEST_URL: PROD_URL }
});


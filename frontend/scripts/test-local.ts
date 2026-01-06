/**
 * Local Testing Script
 * Tests the chatbot system locally with D1 database
 * 
 * Usage:
 *   npm run test:local
 * 
 * Prerequisites:
 *   1. Create local D1 database: npx wrangler d1 create thoughtguards-db --local
 *   2. Run migrations: npx wrangler d1 execute thoughtguards-db --local --file=./db/migrations/001_initial.sql
 *   3. Generate and apply seed data: npm run seed:local
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '../..');

async function testLocalSetup() {
  console.log('🧪 Testing Local Chatbot System Setup\n');

  // Check if wrangler is installed
  try {
    execSync('npx wrangler --version', { stdio: 'ignore' });
    console.log('✅ Wrangler CLI found');
  } catch (e) {
    console.error('❌ Wrangler CLI not found. Install with: npm install -g wrangler');
    process.exit(1);
  }

  // Check if database exists
  const dbPath = path.join(ROOT_DIR, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  if (!fs.existsSync(dbPath)) {
    console.log('⚠️  Local D1 database not found. Creating...');
    try {
      execSync('npx wrangler d1 create thoughtguards-db --local', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });
    } catch (e) {
      console.error('❌ Failed to create local database');
      process.exit(1);
    }
  } else {
    console.log('✅ Local D1 database found');
  }

  // Check if schema is applied
  console.log('\n📋 Checking database schema...');
  try {
    execSync('npx wrangler d1 execute thoughtguards-db --local --command="SELECT name FROM sqlite_master WHERE type=\'table\'"', {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
    });
    console.log('✅ Database schema appears to be applied');
  } catch (e) {
    console.log('⚠️  Schema check failed. Run migrations: npm run migrate:local');
  }

  // Check if seed data exists
  const seedFile = path.join(__dirname, '../db/seed_data.sql');
  if (fs.existsSync(seedFile)) {
    console.log('✅ Seed data file found');
  } else {
    console.log('⚠️  Seed data file not found. Generate with: npm run seed:generate');
  }

  // Check environment variables
  console.log('\n🔑 Checking environment variables...');
  const envFile = path.join(__dirname, '../.dev.vars');
  if (fs.existsSync(envFile)) {
    console.log('✅ .dev.vars file found');
    const envContent = fs.readFileSync(envFile, 'utf-8');
    if (envContent.includes('GEMINI_API_KEY') || envContent.includes('GOOGLE_API_KEY')) {
      console.log('✅ API key found in .dev.vars');
    } else {
      console.log('⚠️  No API key found in .dev.vars. Add: GEMINI_API_KEY=your_key');
    }
  } else {
    console.log('⚠️  .dev.vars file not found. Create it with your API keys.');
  }

  console.log('\n✅ Local setup check complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Ensure .dev.vars has your API keys');
  console.log('   2. Run migrations: npm run migrate:local');
  console.log('   3. Seed database: npm run seed:local');
  console.log('   4. Start dev server: npm run dev:local');
}

testLocalSetup().catch(console.error);


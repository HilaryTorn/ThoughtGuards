/**
 * Apply migrations and seed data to local D1 database
 * Uses the local SQLite database file directly
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const MIGRATION_FILE = path.join(__dirname, '../db/migrations/001_initial.sql');
const SEED_FILE = path.join(__dirname, '../db/seed_data.sql');

async function applyMigrations() {
  console.log('🗄️  Applying migrations to local D1 database...\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Database file not found. Start dev server first: npm run dev:local');
    process.exit(1);
  }

  try {
    // Use better-sqlite3 to execute SQL
    const db = new Database(DB_PATH);
    
    // Read and execute migration file
    if (fs.existsSync(MIGRATION_FILE)) {
      console.log('📝 Applying schema migration...');
      const migrationSQL = fs.readFileSync(MIGRATION_FILE, 'utf-8');
      db.exec(migrationSQL);
      console.log('✅ Schema migration applied\n');
    } else {
      console.log('⚠️  Migration file not found, skipping...\n');
    }

    // Read and execute seed file
    if (fs.existsSync(SEED_FILE)) {
      console.log('🌱 Seeding database...');
      const seedSQL = fs.readFileSync(SEED_FILE, 'utf-8');
      db.exec(seedSQL);
      console.log('✅ Database seeded\n');
    } else {
      console.log('⚠️  Seed file not found. Run: npm run seed:generate\n');
    }

    db.close();
    console.log('✅ Local database setup complete!');
  } catch (error: any) {
    console.error('❌ Error applying migrations:', error.message);
    process.exit(1);
  }
}

applyMigrations();


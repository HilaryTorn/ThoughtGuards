#!/usr/bin/env tsx
/**
 * Seed Mock E-commerce Data
 *
 * Loads mock data from cot-generator/data/ into D1 database
 * for Red Team Lab tool functionality.
 *
 * Usage:
 *   npm run seed:mock-data:local     # Seed local D1
 *   npm run seed:mock-data:production # Seed production D1
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read JSON files
const dataDir = path.join(__dirname, '../../cot-generator/data');
const productsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'products.json'), 'utf-8'));
const customersData = JSON.parse(fs.readFileSync(path.join(dataDir, 'customers.json'), 'utf-8'));
const ordersData = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf-8'));
const policiesData = JSON.parse(fs.readFileSync(path.join(dataDir, 'policies.json'), 'utf-8'));

const isProduction = process.argv.includes('--production');
const localFlag = isProduction ? '--remote' : '--local';

function escapeSqlValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'object') {
    // JSON stringify and escape single quotes
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  // String: escape single quotes
  return `'${String(val).replace(/'/g, "''")}'`;
}

function executeD1File(sqlFile: string) {
  const command = `npx wrangler d1 execute thoughtguards-db ${localFlag} --file="${sqlFile}"`;
  try {
    execSync(command, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (error) {
    console.error(`Failed to execute SQL file: ${sqlFile}`);
    throw error;
  }
}

function buildAndExecuteSql(statements: string[], label: string) {
  // Write statements to a temp file and execute
  const tempFile = path.join(__dirname, `temp-${label}.sql`);
  fs.writeFileSync(tempFile, statements.join('\n'));

  try {
    executeD1File(tempFile);
  } finally {
    // Clean up temp file
    fs.unlinkSync(tempFile);
  }
}

function seedProducts() {
  console.log('Seeding products...');
  const statements: string[] = [];

  for (const [sku, product] of Object.entries(productsData)) {
    const prod = product as any;
    const sql = `INSERT OR REPLACE INTO products (sku, name, category, price, cost, stock, competitor_prices, rating, reviews_count, known_issues, return_rate, margin_tier, warranty_months, description) VALUES (${escapeSqlValue(sku)}, ${escapeSqlValue(prod.name)}, ${escapeSqlValue(prod.category)}, ${prod.price}, ${prod.cost}, ${prod.stock}, ${escapeSqlValue(prod.competitor_prices)}, ${prod.rating}, ${prod.reviews_count}, ${escapeSqlValue(prod.known_issues || [])}, ${prod.return_rate}, ${escapeSqlValue(prod.margin_tier)}, ${prod.warranty_months}, ${escapeSqlValue(prod.description)});`;
    statements.push(sql);
  }

  buildAndExecuteSql(statements, 'products');
  console.log(`✓ Seeded ${statements.length} products`);
}

function seedCustomers() {
  console.log('Seeding customers...');
  const statements: string[] = [];

  for (const [customerId, customer] of Object.entries(customersData)) {
    const cust = customer as any;
    const sql = `INSERT OR REPLACE INTO customers (customer_id, name, email, phone, member_since, lifetime_value, total_orders, total_returns, return_rate, segment, notes, preferences, loyalty_tier) VALUES (${escapeSqlValue(customerId)}, ${escapeSqlValue(cust.name)}, ${escapeSqlValue(cust.email)}, ${escapeSqlValue(cust.phone)}, ${escapeSqlValue(cust.member_since)}, ${cust.lifetime_value}, ${cust.total_orders}, ${cust.total_returns}, ${cust.return_rate}, ${escapeSqlValue(cust.segment)}, ${escapeSqlValue(cust.notes || [])}, ${escapeSqlValue(cust.preferences || {})}, ${escapeSqlValue(cust.loyalty_tier)});`;
    statements.push(sql);
  }

  buildAndExecuteSql(statements, 'customers');
  console.log(`✓ Seeded ${statements.length} customers`);
}

function seedOrders() {
  console.log('Seeding orders...');
  const orderStatements: string[] = [];
  const itemStatements: string[] = [];

  for (const [orderId, order] of Object.entries(ordersData)) {
    const ord = order as any;

    // Insert order
    const orderSql = `INSERT OR REPLACE INTO orders (order_id, customer_id, date, status, subtotal, tax, shipping, total, shipping_address, tracking, delivered_date, return_eligible_until) VALUES (${escapeSqlValue(orderId)}, ${escapeSqlValue(ord.customer_id)}, ${escapeSqlValue(ord.date)}, ${escapeSqlValue(ord.status)}, ${ord.subtotal}, ${ord.tax}, ${ord.shipping}, ${ord.total}, ${escapeSqlValue(ord.shipping_address)}, ${escapeSqlValue(ord.tracking)}, ${escapeSqlValue(ord.delivered_date)}, ${escapeSqlValue(ord.return_eligible_until)});`;
    orderStatements.push(orderSql);

    // Insert order items
    for (const item of ord.items || []) {
      const itemSql = `INSERT OR REPLACE INTO order_items (order_id, sku, quantity, price) VALUES (${escapeSqlValue(orderId)}, ${escapeSqlValue(item.sku)}, ${item.quantity}, ${item.price});`;
      itemStatements.push(itemSql);
    }
  }

  buildAndExecuteSql(orderStatements, 'orders');
  console.log(`✓ Seeded ${orderStatements.length} orders`);

  if (itemStatements.length > 0) {
    buildAndExecuteSql(itemStatements, 'order-items');
    console.log(`✓ Seeded ${itemStatements.length} order items`);
  }
}

function seedPolicies() {
  console.log('Seeding policies...');
  const statements: string[] = [];

  for (const [policyType, policyData] of Object.entries(policiesData)) {
    const sql = `INSERT OR REPLACE INTO policies (policy_type, policy_data) VALUES (${escapeSqlValue(policyType)}, ${escapeSqlValue(policyData)});`;
    statements.push(sql);
  }

  buildAndExecuteSql(statements, 'policies');
  console.log(`✓ Seeded ${statements.length} policies`);
}

function verifySeeding() {
  console.log('\nVerifying seeding...');

  const tables = ['products', 'customers', 'orders', 'policies'];
  for (const table of tables) {
    const tempFile = path.join(__dirname, `temp-verify-${table}.sql`);
    fs.writeFileSync(tempFile, `SELECT COUNT(*) as count FROM ${table};`);
    console.log(`\n${table} count:`);
    try {
      executeD1File(tempFile);
    } finally {
      fs.unlinkSync(tempFile);
    }
  }
}

async function main() {
  console.log('Starting mock e-commerce data seeding...\n');
  console.log(`Mode: ${isProduction ? 'PRODUCTION' : 'LOCAL'}\n`);

  if (isProduction) {
    console.log('⚠️  WARNING: This will seed PRODUCTION database!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  try {
    seedProducts();
    seedCustomers();
    seedOrders();
    seedPolicies();
    verifySeeding();

    console.log('\n✓ Mock data seeding complete!');
  } catch (error) {
    console.error('\n✗ Seeding failed:', error);
    process.exit(1);
  }
}

main();

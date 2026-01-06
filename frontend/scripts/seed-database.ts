/**
 * Database seeding script for Cloudflare D1
 * Seeds data from cot-generator/data/*.json files
 * 
 * Usage: 
 *   npx wrangler d1 execute DB_NAME --file=./db/schema.sql
 *   node scripts/seed-database.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to data files
// From frontend/scripts/, go up to ThoughtGuards/, then to cot-generator/data
const DATA_DIR = path.join(__dirname, '../../cot-generator/data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const POLICIES_FILE = path.join(DATA_DIR, 'policies.json');

interface Product {
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  competitor_prices: Record<string, number>;
  rating: number;
  reviews_count: number;
  known_issues: string[];
  return_rate: number;
  margin_tier: string;
  warranty_months: number;
  description: string;
}

interface Customer {
  name: string;
  email: string;
  phone: string;
  member_since: string;
  lifetime_value: number;
  total_orders: number;
  total_returns: number;
  return_rate: number;
  segment: string;
  notes: string[];
  preferences: Record<string, string>;
  loyalty_tier: string;
  support_history?: {
    tickets_last_30_days?: number;
    reopen_rate?: number;
    avg_resolution_time_minutes?: number;
  };
}

interface Order {
  customer_id: string;
  date: string;
  status: string;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  shipping_address: string;
  tracking?: string;
  delivered_date?: string;
  return_eligible_until?: string;
  return_date?: string;
  return_reason?: string;
  refund_amount?: number;
  return_notes?: string;
  support_tickets?: Array<{
    date: string;
    issue: string;
    status: string;
    resolution: string;
  }>;
}

interface Policies {
  return_policy?: any;
  price_match_policy?: any;
  warranty_policy?: any;
  shipping_policy?: any;
  discount_codes?: any;
  escalation_policy?: any;
}

/**
 * Generate SQL INSERT statements for products
 */
function seedProducts(): string[] {
  const productsData = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
  const statements: string[] = [];

  for (const [sku, product] of Object.entries(productsData)) {
    const p = product as Product;
    const competitorPrices = JSON.stringify(p.competitor_prices || {});
    const knownIssues = JSON.stringify(p.known_issues || []);

    statements.push(`
      INSERT OR REPLACE INTO products (
        sku, name, category, price, cost, stock, competitor_prices,
        rating, reviews_count, known_issues, return_rate, margin_tier,
        warranty_months, description
      ) VALUES (
        '${sku}',
        '${p.name.replace(/'/g, "''")}',
        '${p.category}',
        ${p.price},
        ${p.cost},
        ${p.stock},
        '${competitorPrices.replace(/'/g, "''")}',
        ${p.rating},
        ${p.reviews_count},
        '${knownIssues.replace(/'/g, "''")}',
        ${p.return_rate},
        '${p.margin_tier}',
        ${p.warranty_months},
        '${p.description.replace(/'/g, "''")}'
      );
    `);
  }

  return statements;
}

/**
 * Generate SQL INSERT statements for customers
 */
function seedCustomers(): string[] {
  const customersData = JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf-8'));
  const statements: string[] = [];

  for (const [customerId, customer] of Object.entries(customersData)) {
    const c = customer as Customer;
    const notes = JSON.stringify(c.notes || []);
    const preferences = JSON.stringify(c.preferences || {});
    const supportHistory = JSON.stringify(c.support_history || {});

    statements.push(`
      INSERT OR REPLACE INTO customers (
        customer_id, name, email, phone, member_since, lifetime_value,
        total_orders, total_returns, return_rate, segment, notes,
        preferences, loyalty_tier, support_history
      ) VALUES (
        '${customerId}',
        '${c.name.replace(/'/g, "''")}',
        '${c.email}',
        '${c.phone}',
        '${c.member_since}',
        ${c.lifetime_value},
        ${c.total_orders},
        ${c.total_returns},
        ${c.return_rate},
        '${c.segment}',
        '${notes.replace(/'/g, "''")}',
        '${preferences.replace(/'/g, "''")}',
        '${c.loyalty_tier}',
        '${supportHistory.replace(/'/g, "''")}'
      );
    `);
  }

  return statements;
}

/**
 * Generate SQL INSERT statements for orders and order_items
 */
function seedOrders(): { orders: string[]; orderItems: string[]; supportTickets: string[] } {
  const ordersData = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
  const orderStatements: string[] = [];
  const orderItemStatements: string[] = [];
  const supportTicketStatements: string[] = [];
  let ticketCounter = 1;

  for (const [orderId, order] of Object.entries(ordersData)) {
    const o = order as Order;

    // Insert order
    orderStatements.push(`
      INSERT OR REPLACE INTO orders (
        order_id, customer_id, date, status, subtotal, tax, shipping, total,
        shipping_address, tracking, delivered_date, return_eligible_until,
        return_date, return_reason, refund_amount, return_notes
      ) VALUES (
        '${orderId}',
        '${o.customer_id}',
        '${o.date}',
        '${o.status}',
        ${o.subtotal},
        ${o.tax},
        ${o.shipping},
        ${o.total},
        '${(o.shipping_address || '').replace(/'/g, "''")}',
        ${o.tracking ? `'${o.tracking}'` : 'NULL'},
        ${o.delivered_date ? `'${o.delivered_date}'` : 'NULL'},
        ${o.return_eligible_until ? `'${o.return_eligible_until}'` : 'NULL'},
        ${o.return_date ? `'${o.return_date}'` : 'NULL'},
        ${o.return_reason ? `'${o.return_reason.replace(/'/g, "''")}'` : 'NULL'},
        ${o.refund_amount !== undefined ? o.refund_amount : 'NULL'},
        ${o.return_notes ? `'${o.return_notes.replace(/'/g, "''")}'` : 'NULL'}
      );
    `);

    // Insert order items
    for (const item of o.items || []) {
      orderItemStatements.push(`
        INSERT OR REPLACE INTO order_items (
          order_id, sku, quantity, price
        ) VALUES (
          '${orderId}',
          '${item.sku}',
          ${item.quantity},
          ${item.price}
        );
      `);
    }

    // Insert support tickets if any
    if (o.support_tickets && o.support_tickets.length > 0) {
      for (const ticket of o.support_tickets) {
        const ticketId = `TICKET-${orderId}-${ticketCounter++}`;
        supportTicketStatements.push(`
          INSERT OR REPLACE INTO support_tickets (
            ticket_id, order_id, customer_id, date, issue, status, resolution
          ) VALUES (
            '${ticketId}',
            '${orderId}',
            '${o.customer_id}',
            '${ticket.date}',
            '${ticket.issue.replace(/'/g, "''")}',
            '${ticket.status}',
            ${ticket.resolution ? `'${ticket.resolution.replace(/'/g, "''")}'` : 'NULL'}
          );
        `);
      }
    }
  }

  return {
    orders: orderStatements,
    orderItems: orderItemStatements,
    supportTickets: supportTicketStatements
  };
}

/**
 * Generate SQL INSERT statements for policies
 */
function seedPolicies(): string[] {
  const policiesData = JSON.parse(fs.readFileSync(POLICIES_FILE, 'utf-8'));
  const statements: string[] = [];

  const policyTypes = [
    'return_policy',
    'price_match_policy',
    'warranty_policy',
    'shipping_policy',
    'discount_codes',
    'escalation_policy'
  ];

  for (const policyType of policyTypes) {
    if (policiesData[policyType]) {
      const policyData = JSON.stringify(policiesData[policyType]);
      statements.push(`
        INSERT OR REPLACE INTO policies (
          policy_type, policy_data
        ) VALUES (
          '${policyType}',
          '${policyData.replace(/'/g, "''")}'
        );
      `);
    }
  }

  return statements;
}

/**
 * Generate complete SQL script
 */
function generateSeedScript(): string {
  const statements: string[] = [];

  statements.push('-- Products');
  statements.push(...seedProducts());

  statements.push('\n-- Customers');
  statements.push(...seedCustomers());

  statements.push('\n-- Orders');
  const orderData = seedOrders();
  statements.push(...orderData.orders);

  statements.push('\n-- Order Items');
  statements.push(...orderData.orderItems);

  statements.push('\n-- Support Tickets');
  statements.push(...orderData.supportTickets);

  statements.push('\n-- Policies');
  statements.push(...seedPolicies());

  return statements.join('\n');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed-database.ts')) {
  const sql = generateSeedScript();
  const outputFile = path.join(__dirname, '../db/seed_data.sql');
  
  // Ensure db directory exists
  const dbDir = path.dirname(outputFile);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  fs.writeFileSync(outputFile, sql);
  console.log(`Seed script generated: ${outputFile}`);
  console.log(`Total statements: ${sql.split(';').length - 1}`);
}

export { generateSeedScript, seedProducts, seedCustomers, seedOrders, seedPolicies };


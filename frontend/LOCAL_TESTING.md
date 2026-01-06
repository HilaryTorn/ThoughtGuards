# Local Testing Guide

This guide explains how to test the e-commerce chatbot system locally before deploying to Cloudflare.

## Prerequisites

1. **Node.js** (v18 or later)
2. **Wrangler CLI**: `npm install -g wrangler` or `npm install wrangler --save-dev`
3. **API Keys**: At least one LLM provider API key (Gemini recommended)

## Quick Start

### Option 1: Automated Setup (Recommended)

```bash
cd ThoughtGuards/frontend
npm install
npm run setup:local  # Creates DB, runs migrations, seeds data
```

Then create `.dev.vars` file (see step 2 below) and start the server:

```bash
npm run build        # Build frontend for Pages Functions
npm run dev:local    # Start full-stack dev server
```

### Option 2: Manual Setup

### 1. Install Dependencies

```bash
cd ThoughtGuards/frontend
npm install
```

### 2. Set Up Environment Variables

Create a `.dev.vars` file in the `frontend` directory:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add your API keys:

```
GEMINI_API_KEY=your_actual_api_key_here
```

### 3. Create Local D1 Database

```bash
npx wrangler d1 create thoughtguards-db --local
```

This creates a local SQLite database for testing.

### 4. Run Database Migrations

```bash
npm run migrate:local
```

This applies the database schema to your local D1 database.

### 5. Generate and Seed Database

```bash
# Generate seed data SQL from JSON files
npm run seed:generate

# Apply seed data to local database
npm run seed:local
```

Or run both at once:

```bash
npm run setup:local
```

### 6. Build the Frontend

```bash
npm run build
```

### 7. Start Local Development Server

```bash
npm run dev:local
```

This starts the Cloudflare Pages dev server with D1 database binding.

### 8. Test the Chat Interface

1. Open your browser to the local URL (usually `http://localhost:8788`)
2. Navigate to the "Chat" view
3. Select a customer ID (e.g., `CUST-5001`)
4. Start chatting!

## Testing Checklist

### Database Tests

```bash
# Check if tables exist
npx wrangler d1 execute thoughtguards-db --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# Check customer count
npx wrangler d1 execute thoughtguards-db --local --command="SELECT COUNT(*) FROM customers"

# Check product count
npx wrangler d1 execute thoughtguards-db --local --command="SELECT COUNT(*) FROM products"
```

### Tool Function Tests

Test individual tools by making requests to the API:

```bash
# Test lookup_product
curl -X POST http://localhost:8788/api/tools/lookup_product \
  -H "Content-Type: application/json" \
  -d '{"product_id": "SKU-1001"}'

# Test get_customer_history
curl -X POST http://localhost:8788/api/tools/get_customer_history \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "CUST-5001"}'
```

### Chat API Tests

```bash
# Test chat endpoint
curl -X POST http://localhost:8788/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need help with a return",
    "customer_id": "CUST-5001",
    "chatbot_mode": "helpful",
    "model": "gemini-3-flash-preview"
  }'
```

## Quick Verification

After setup, verify everything works:

```bash
# Check setup
npm run test:local

# Verify database seeding
npm run verify:seeding

# Verify chat system (requires dev server running)
npm run verify:chat
```

## Troubleshooting

### Database Not Found

If you get "database not found" errors:

```bash
# Recreate local database
npx wrangler d1 create thoughtguards-db --local

# Re-run migrations
npm run migrate:local
```

### API Key Errors

Make sure `.dev.vars` exists and contains your API key:

```bash
# Check if file exists
ls -la .dev.vars

# View contents (be careful not to commit this!)
cat .dev.vars
```

### Port Already in Use

If port 8788 is in use, Wrangler will automatically use the next available port. Check the console output for the actual URL.

### Seed Data Not Loading

1. Verify seed script generated the SQL file:
   ```bash
   ls -la db/seed_data.sql
   ```

2. Check for errors in seed script:
   ```bash
   npm run seed:generate
   ```

3. Manually verify SQL file has content:
   ```bash
   head -20 db/seed_data.sql
   ```

## Local Database Location

The local D1 database is stored at:
```
.wrangler/state/v3/d1/miniflare-D1DatabaseObject
```

You can inspect it directly using SQLite:

```bash
sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject
```

Then run SQL queries:
```sql
SELECT * FROM customers LIMIT 5;
SELECT * FROM products LIMIT 5;
SELECT * FROM conversations;
```

## Next Steps

Once local testing is successful:

1. **Test all chatbot modes**: Try helpful, conversion_optimized, retention_focused, metric_gamer
2. **Test all tools**: Verify each tool function works correctly
3. **Test conversation flow**: Have full conversations and verify CoT extraction
4. **Test edge cases**: Invalid customer IDs, missing products, etc.

After local testing passes, proceed with Cloudflare deployment!


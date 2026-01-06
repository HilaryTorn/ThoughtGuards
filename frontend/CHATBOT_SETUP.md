# E-commerce Chatbot System Setup

This document describes how to set up and deploy the real e-commerce chatbot system.

## Overview

The chatbot system has been reverse-engineered from mock data to create a real, production-ready system with:
- **Real database** (Cloudflare D1) instead of JSON files
- **Actual tool calls** to database instead of mock responses
- **Customer-facing chat interface** integrated into existing frontend
- **Seeded data** from existing mock_data and cot-generator data

## Prerequisites

1. Cloudflare account with D1 database access
2. API keys for LLM providers (at least one):
   - Google Gemini API key
   - DeepSeek API key (optional)
   - Anthropic Claude API key (optional)
   - OpenAI API key (optional)

## Setup Steps

### 1. Create D1 Database

```bash
cd ThoughtGuards/frontend
npx wrangler d1 create thoughtguards-db
```

This will output a database ID. Update `wrangler.toml` with the database_id.

### 2. Run Database Migrations

```bash
# Apply schema
npx wrangler d1 execute thoughtguards-db --file=./db/migrations/001_initial.sql

# Generate seed data SQL
node scripts/seed-database.ts

# Apply seed data
npx wrangler d1 execute thoughtguards-db --file=./db/seed_data.sql
```

### 3. Set Environment Variables

Set API keys as Cloudflare secrets:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put DEEPSEEK_API_KEY  # Optional
npx wrangler secret put ANTHROPIC_API_KEY  # Optional
npx wrangler secret put OPENAI_API_KEY  # Optional
```

### 4. Deploy to Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy dist
```

## Local Development

For local development with D1:

```bash
# Start local D1 database
npx wrangler d1 execute thoughtguards-db --local --file=./db/migrations/001_initial.sql
npx wrangler d1 execute thoughtguards-db --local --file=./db/seed_data.sql

# Run dev server with D1
npx wrangler pages dev dist --d1=DB=thoughtguards-db
```

## Usage

1. Navigate to the "Chat" view in the application
2. Select a customer ID (e.g., CUST-5001 to CUST-5030)
3. Select a chatbot mode (helpful, conversion_optimized, retention_focused, metric_gamer)
4. Start chatting!

The chatbot will:
- Make real database queries via tool calls
- Extract and display reasoning traces (CoT)
- Store all conversations and tool calls in the database

## Database Schema

See `db/schema.sql` for the complete schema. Key tables:
- `customers` - Customer profiles and history
- `products` - Product catalog with internal fields
- `orders` - Order history
- `policies` - Store policies (return, price match, etc.)
- `conversations` - Chat conversation records
- `conversation_turns` - Individual messages with CoT
- `tool_calls` - All tool executions

## Tool Functions

All 11 tools are implemented:
1. `lookup_product` - Search products by SKU or query
2. `check_inventory` - Check stock levels
3. `get_customer_history` - Get customer profile and orders
4. `check_competitor_prices` - Get competitor pricing
5. `get_policy` - Get store policies
6. `get_order_details` - Get order information
7. `create_order` - Create new order
8. `process_return` - Process return request
9. `apply_discount` - Apply manual discount
10. `send_email` - Log email (no actual sending)
11. `escalate_to_human` - Log escalation

## Chatbot Modes

Four modes are available:
- **helpful** - Baseline honest agent
- **conversion_optimized** - Optimized for sales
- **retention_focused** - Optimized for satisfaction scores
- **metric_gamer** - Optimized specifically for survey scores

## Notes

- The Google GenAI library import in `llmClient.ts` may need adjustment for Cloudflare Workers. The REST API fallback is implemented.
- Tool functions return internal fields (cost, margin, known_issues) that the chatbot can choose to reveal or hide.
- All conversations and tool calls are logged to the database for analysis.


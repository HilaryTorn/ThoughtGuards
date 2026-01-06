<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ThoughtGuards - CoT Manipulation Monitor

A safety monitoring dashboard for detecting manipulation in AI chain-of-thought reasoning. Built with React, Hono, and Cloudflare Workers.

## Prerequisites

- Node.js (v18+)
- npm

## Local Development

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Set up environment variables

Create a `.dev.vars` file in the `frontend` directory:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

You can get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

### 3. Initialize the local database

The app uses Cloudflare D1 (SQLite) for data storage. For local development, a local SQLite database is created automatically.

Reset and initialize the database schema:

```bash
# Remove existing local database (if any) and create fresh
rm -rf .wrangler/state/v3/d1

# Run the schema to create all tables
npx wrangler d1 execute thoughtguards-db --local --file=./db/schema.sql
```

### 4. Build and run locally

```bash
# Build the frontend and start the worker dev server
npm run dev:local
```

This will:
- Build the React frontend to `dist/`
- Start the Cloudflare Workers dev server with local D1

The app will be available at **http://localhost:8787**

### Alternative: Vite-only development

For frontend-only development without the worker:

```bash
npm run dev
```

This runs the Vite dev server but won't have API functionality.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run Vite dev server (frontend only) |
| `npm run dev:local` | Build and run with local Workers + D1 |
| `npm run dev:worker` | Build and run with remote D1 (requires auth) |
| `npm run build` | Build frontend for production |

## Project Structure

```
frontend/
├── src/
│   └── worker/           # Cloudflare Worker (Hono API)
│       ├── index.ts      # Main entry point
│       └── routes/       # API route handlers
├── components/           # React components
├── lib/                  # Shared utilities
├── db/
│   ├── schema.sql        # Database schema
│   └── migrations/       # Database migrations
├── wrangler.json         # Cloudflare Workers config
└── .dev.vars             # Local environment variables (not committed)
```

## Troubleshooting

### "no such table" errors

Run the database schema setup:

```bash
rm -rf .wrangler/state/v3/d1
npx wrangler d1 execute thoughtguards-db --local --file=./db/schema.sql
```

### Port already in use

If port 8787 is busy, wrangler will use 8788 or the next available port.

### API key not working

Ensure your `.dev.vars` file is in the `frontend` directory and contains:

```
GEMINI_API_KEY=your_key_here
```

## Deployment

For production deployment to Cloudflare:

```bash
npm run build
npx wrangler deploy
```

Note: Production deployment requires Cloudflare account authentication and access to the D1 database.

#!/bin/bash
# Deployment script for Cloudflare Pages and D1
# 
# Usage:
#   ./scripts/deploy.sh
#   or: npm run deploy
#
# Prerequisites:
#   1. Wrangler CLI installed: npm install -g wrangler
#   2. Cloudflare account configured: wrangler login
#   3. D1 database created: wrangler d1 create thoughtguards-db
#   4. Database ID set in wrangler.toml
#   5. API keys set as secrets: wrangler secret put GEMINI_API_KEY

set -e

echo "🚀 Deploying to Cloudflare..."
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
fi

# Check if database ID is set in wrangler.toml
if grep -q 'database_id = ""' wrangler.toml; then
    echo "⚠️  Database ID not set in wrangler.toml"
    echo "   Create database with: wrangler d1 create thoughtguards-db"
    echo "   Then update database_id in wrangler.toml"
    exit 1
fi

# Build frontend
echo "📦 Building frontend..."
npm run build

# Apply database migrations
echo ""
echo "🗄️  Applying database migrations..."
if [ -f "db/migrations/001_initial.sql" ]; then
    wrangler d1 execute thoughtguards-db --file=./db/migrations/001_initial.sql
else
    echo "⚠️  No migration file found, skipping..."
fi

# Generate and apply seed data
echo ""
echo "🌱 Seeding database..."
npm run seed:generate
wrangler d1 execute thoughtguards-db --file=./db/seed_data.sql

# Deploy to Cloudflare Pages
echo ""
echo "☁️  Deploying to Cloudflare Pages..."
wrangler pages deploy dist --project-name=thoughtguards-chatbot

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Test production deployment"
echo "   2. Set up custom domain (optional)"
echo "   3. Configure environment variables in Cloudflare dashboard"


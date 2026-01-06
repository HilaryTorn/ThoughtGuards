#!/bin/bash
# Local Development Setup Script
# Sets up local D1 database, runs migrations, and seeds data

set -e

echo "🚀 Setting up local development environment..."
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

# Create local D1 database
echo "📦 Creating local D1 database..."
npx wrangler d1 create thoughtguards-db --local || echo "Database may already exist"

# Run migrations
echo "📋 Running database migrations..."
npm run migrate:local

# Generate seed data
echo "🌱 Generating seed data..."
npm run seed:generate

# Seed database
echo "🌱 Seeding database..."
npm run seed:local

echo ""
echo "✅ Local setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Create .dev.vars file with your API keys (see .dev.vars.example)"
echo "   2. Build the frontend: npm run build"
echo "   3. Start dev server: npm run dev:local"
echo "   4. Open browser to the URL shown in the console"


# Deployment script for Cloudflare Pages and D1 (PowerShell)
# 
# Usage:
#   .\scripts\deploy.ps1
#   or: npm run deploy
#
# Prerequisites:
#   1. Wrangler CLI installed: npm install -g wrangler
#   2. Cloudflare account configured: wrangler login
#   3. D1 database created: wrangler d1 create thoughtguards-db
#   4. Database ID set in wrangler.toml
#   5. API keys set as secrets: wrangler secret put GEMINI_API_KEY

$ErrorActionPreference = "Stop"

Write-Host "🚀 Deploying to Cloudflare..." -ForegroundColor Cyan
Write-Host ""

# Check if wrangler is installed
try {
    $null = Get-Command wrangler -ErrorAction Stop
} catch {
    Write-Host "❌ Wrangler CLI not found. Install with: npm install -g wrangler" -ForegroundColor Red
    exit 1
}

# Check if database ID is set in wrangler.toml
$wranglerContent = Get-Content wrangler.toml -Raw
if ($wranglerContent -match 'database_id = ""') {
    Write-Host "⚠️  Database ID not set in wrangler.toml" -ForegroundColor Yellow
    Write-Host "   Create database with: wrangler d1 create thoughtguards-db"
    Write-Host "   Then update database_id in wrangler.toml"
    exit 1
}

# Build frontend
Write-Host "📦 Building frontend..." -ForegroundColor Cyan
npm run build

# Apply database migrations
Write-Host ""
Write-Host "🗄️  Applying database migrations..." -ForegroundColor Cyan
if (Test-Path "db/migrations/001_initial.sql") {
    wrangler d1 execute thoughtguards-db --file=./db/migrations/001_initial.sql
} else {
    Write-Host "⚠️  No migration file found, skipping..." -ForegroundColor Yellow
}

# Generate and apply seed data
Write-Host ""
Write-Host "🌱 Seeding database..." -ForegroundColor Cyan
npm run seed:generate
wrangler d1 execute thoughtguards-db --file=./db/seed_data.sql

# Deploy to Cloudflare Pages
Write-Host ""
Write-Host "☁️  Deploying to Cloudflare Pages..." -ForegroundColor Cyan
wrangler pages deploy dist --project-name=thoughtguards-chatbot

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:"
Write-Host "   1. Test production deployment"
Write-Host "   2. Set up custom domain (optional)"
Write-Host "   3. Configure environment variables in Cloudflare dashboard"


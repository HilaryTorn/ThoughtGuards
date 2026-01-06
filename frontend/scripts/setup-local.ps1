# Local Development Setup Script (PowerShell)
# Sets up local D1 database, runs migrations, and seeds data

Write-Host "🚀 Setting up local development environment..." -ForegroundColor Cyan
Write-Host ""

# Check if wrangler is installed
try {
    $null = Get-Command wrangler -ErrorAction Stop
    Write-Host "✅ Wrangler CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ Wrangler CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g wrangler
}

# Create local D1 database
Write-Host "📦 Creating local D1 database..." -ForegroundColor Cyan
npx wrangler d1 create thoughtguards-db --local
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Database may already exist, continuing..." -ForegroundColor Yellow
}

# Run migrations
Write-Host "📋 Running database migrations..." -ForegroundColor Cyan
npm run migrate:local

# Generate seed data
Write-Host "🌱 Generating seed data..." -ForegroundColor Cyan
npm run seed:generate

# Seed database
Write-Host "🌱 Seeding database..." -ForegroundColor Cyan
npm run seed:local

Write-Host ""
Write-Host "✅ Local setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Create .dev.vars file with your API keys (see .dev.vars.example)"
Write-Host "   2. Build the frontend: npm run build"
Write-Host "   3. Start dev server: npm run dev:local"
Write-Host "   4. Open browser to the URL shown in the console"


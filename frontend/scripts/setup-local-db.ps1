# Setup Local D1 Database
# This script sets up the local D1 database for development

Write-Host "🗄️  Setting up local D1 database..." -ForegroundColor Cyan

# The local database is created automatically when we use wrangler pages dev
# For now, we'll use a workaround: start dev server briefly to create DB, then run migrations

Write-Host "📝 Note: Local D1 database will be created automatically when you run 'npm run dev:local'" -ForegroundColor Yellow
Write-Host ""
Write-Host "To set up the database:" -ForegroundColor Yellow
Write-Host "  1. Run: npm run dev:local (in one terminal)" -ForegroundColor White
Write-Host "  2. Wait for server to start" -ForegroundColor White
Write-Host "  3. In another terminal, run migrations manually using the database file" -ForegroundColor White
Write-Host ""
Write-Host "Or use the database file directly at:" -ForegroundColor Yellow
Write-Host "  .wrangler/state/v3/d1/miniflare-D1DatabaseObject" -ForegroundColor White
Write-Host ""
Write-Host "You can use sqlite3 to run migrations:" -ForegroundColor Yellow
Write-Host "  sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject < db/migrations/001_initial.sql" -ForegroundColor White


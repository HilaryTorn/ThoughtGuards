# Apply migrations using sqlite3
# Note: Database must not be locked by dev server

param(
    [string]$DbPath = ".wrangler\state\v3\d1\miniflare-D1DatabaseObject",
    [string]$MigrationFile = "db\migrations\001_initial.sql",
    [string]$SeedFile = "db\seed_data.sql"
)

Write-Host "🗄️  Applying migrations to local D1 database..." -ForegroundColor Cyan
Write-Host ""

$fullDbPath = Resolve-Path $DbPath -ErrorAction SilentlyContinue
if (-not $fullDbPath) {
    Write-Host "❌ Database file not found: $DbPath" -ForegroundColor Red
    Write-Host "   Make sure dev server has started at least once." -ForegroundColor Yellow
    exit 1
}

Write-Host "Database: $fullDbPath" -ForegroundColor Gray
Write-Host ""

# Check if database is locked
try {
    $testQuery = "SELECT 1;" | sqlite3 $fullDbPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Database appears to be locked by dev server." -ForegroundColor Yellow
        Write-Host "   Stop the dev server (Ctrl+C), then run this script again." -ForegroundColor Yellow
        Write-Host "   Or let the system initialize automatically on first API call." -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "⚠️  Could not access database. It may be locked." -ForegroundColor Yellow
    exit 1
}

# Apply migrations
Write-Host "📝 Applying schema migration..." -ForegroundColor Cyan
try {
    Get-Content $MigrationFile | sqlite3 $fullDbPath
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Schema migration applied" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Migration may have had errors (some tables might already exist)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error applying migration: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Apply seed data
if (Test-Path $SeedFile) {
    Write-Host "🌱 Seeding database..." -ForegroundColor Cyan
    try {
        Get-Content $SeedFile | sqlite3 $fullDbPath
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Database seeded" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Seeding may have had errors (some data might already exist)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ Error seeding database: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⚠️  Seed file not found: $SeedFile" -ForegroundColor Yellow
    Write-Host "   Run: npm run seed:generate" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Local database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start dev server: npm run dev:local" -ForegroundColor White
Write-Host "  2. Test the system: npm run verify:seeding" -ForegroundColor White
Write-Host "  3. Test tools: npm run test:tools" -ForegroundColor White


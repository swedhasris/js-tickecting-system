#!/usr/bin/env pwsh
# ════════════════════════════════════════════════════════════════════════
# Ticklora ITSM — Start All Microservices (Windows PowerShell)
# Run: .\start-all.ps1
# ════════════════════════════════════════════════════════════════════════

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Ticklora ITSM — Microservices Stack    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Install deps for each service if node_modules missing
foreach ($svc in @("core-service","integration-service","activity-service")) {
    $nm = Join-Path $Root $svc "node_modules"
    if (-not (Test-Path $nm)) {
        Write-Host "📦 Installing dependencies for $svc..." -ForegroundColor Yellow
        Push-Location (Join-Path $Root $svc)
        npm install | Out-Null
        Pop-Location
    }
}

# Copy .env to each service
$envFile = Join-Path $Root ".env"
foreach ($svc in @("core-service","integration-service","activity-service")) {
    $dest = Join-Path $Root $svc ".env"
    if (-not (Test-Path $dest)) {
        Copy-Item $envFile $dest
        Write-Host "✓ Copied .env to $svc" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "🚀 Starting services..." -ForegroundColor Green
Write-Host ""

# Start each service in a new terminal window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\core-service'; Write-Host '=== CORE SERVICE ===' -ForegroundColor Green; npx tsx src/index.ts" -WindowStyle Normal
Start-Sleep 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\integration-service'; Write-Host '=== INTEGRATION SERVICE ===' -ForegroundColor Blue; npx tsx src/index.ts" -WindowStyle Normal
Start-Sleep 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\activity-service'; Write-Host '=== ACTIVITY SERVICE ===' -ForegroundColor Magenta; npx tsx src/index.ts" -WindowStyle Normal
Start-Sleep 2

# Start original tis server (React frontend + existing full server)
$tisPath = Join-Path (Split-Path $Root) "tis"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$tisPath'; Write-Host '=== FRONTEND + LEGACY SERVER ===' -ForegroundColor Yellow; npx tsx server.ts" -WindowStyle Normal

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  All services starting...                ║" -ForegroundColor Cyan
Write-Host "║                                          ║" -ForegroundColor Cyan
Write-Host "║  Core Service:        http://localhost:3001  ║" -ForegroundColor White
Write-Host "║  Integration Service: http://localhost:3002  ║" -ForegroundColor White
Write-Host "║  Activity Service:    http://localhost:3003  ║" -ForegroundColor White
Write-Host "║  Main App (tis):      http://localhost:3000  ║" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: The existing 'tis' server continues to run on port 3000." -ForegroundColor Gray
Write-Host "Microservices are available on ports 3001-3003." -ForegroundColor Gray
Write-Host "To switch the frontend to use microservices, update the VITE_API_BASE in tis/.env" -ForegroundColor Gray

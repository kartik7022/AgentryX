#!/usr/bin/env pwsh
# =============================================================
# 08-run-all.ps1
# Full end-to-end POC runner.
# Runs all steps in order with pauses and status summaries.
# =============================================================

$ErrorActionPreference = "Stop"

function Section([string]$title) {
    Write-Host "`n$("=" * 60)" -ForegroundColor DarkCyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host "$("=" * 60)`n" -ForegroundColor DarkCyan
}

function CheckKillBill {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8080/1.0/kb/test/clock" -UseBasicParsing -TimeoutSec 5
        return $true
    } catch {
        return $false
    }
}

# ---- Pre-flight check ----------------------------------------
Section "Pre-flight: Kill Bill health check"
$ready = CheckKillBill
if (-not $ready) {
    Write-Host "[ERROR] Kill Bill is not reachable at http://localhost:8080" -ForegroundColor Red
    Write-Host "        Make sure Docker Compose is running:"
    Write-Host "        cd <your-project> && docker compose up -d"
    exit 1
}
Write-Host "[OK] Kill Bill is reachable." -ForegroundColor Green

$scriptDir = $PSScriptRoot

# ---- Step 0: Tenant ------------------------------------------
Section "Step 0: Tenant Setup"
& "$scriptDir/00-setup-tenant.ps1"

# ---- Step 1: Catalog -----------------------------------------
Section "Step 1: Upload Catalog"
& "$scriptDir/01-upload-catalog.ps1"

# ---- Step 2: Account -----------------------------------------
Section "Step 2: Create Customer Account"
& "$scriptDir/02-create-account.ps1"

# ---- Step 3: Subscriptions -----------------------------------
Section "Step 3: Create Trial Subscriptions"
& "$scriptDir/03-create-subscriptions.ps1"

# ---- Step 4: Usage -------------------------------------------
Section "Step 4: Record Usage"
& "$scriptDir/04-record-usage.ps1"

# ---- Step 5: Upgrade -----------------------------------------
Section "Step 5: Upgrade Trial to Paid"
& "$scriptDir/05-upgrade-to-paid.ps1"

# ---- Step 6: Invoices ----------------------------------------
Section "Step 6: Fetch Invoices"
& "$scriptDir/06-fetch-invoices.ps1"

# ---- Done ----------------------------------------------------
Write-Host @"

$("=" * 60)
  POC COMPLETE
$("=" * 60)

  Tenant       : company_a
  Account      : vinod@example.com
  Subscriptions: ModuleA (calls), ModuleB (monthly), ModuleC (hybrid)
  Usage        : 25 calls + 200 emails recorded
  Invoices     : fetched above

  KAUI (admin UI): http://localhost:9090
    Login: admin / password
    Tenant: company_a / company_a_secret

  To test webhooks:
    1. node webhook-listener.js
    2. Run 07-webhook-test.ps1 with your webhook URL

  To re-run from scratch:
    Remove account-id.txt and subscription-ids.json
    Then run 08-run-all.ps1 again.
$("=" * 60)
"@ -ForegroundColor Green

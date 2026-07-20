#!/usr/bin/env pwsh
# =============================================================
# 06-fetch-invoices.ps1
# Fetches all invoices for the account and prints a summary.
# =============================================================

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/00-setup-tenant.ps1"

$accountId = (Get-Content "$PSScriptRoot/account-id.txt" -Raw).Trim()

Write-Host "`n[Step 6] Fetching invoices for AccountId: $accountId" -ForegroundColor Cyan

$response = Invoke-WebRequest `
    -Uri "$global:KB_URL/1.0/kb/accounts/$accountId/invoices?withItems=true" `
    -Method GET `
    -Headers (KbHeaders) `
    -UseBasicParsing

$invoices = $response.Content | ConvertFrom-Json

if ($invoices.Count -eq 0) {
    Write-Host "[INFO] No invoices yet. Kill Bill generates invoices at phase change or billing date." -ForegroundColor Yellow
    Write-Host "       Try running 05-upgrade-to-paid.ps1 first, or wait for the billing cycle."
} else {
    Write-Host "[OK] $($invoices.Count) invoice(s) found:`n" -ForegroundColor Green

    foreach ($inv in $invoices) {
        Write-Host "  Invoice: $($inv.invoiceId)" -ForegroundColor White
        Write-Host "    Date    : $($inv.invoiceDate)"
        Write-Host "    Amount  : INR $($inv.amount)"
        Write-Host "    Status  : $($inv.status)"
        if ($inv.items) {
            Write-Host "    Items:"
            foreach ($item in $inv.items) {
                Write-Host "      - $($item.description): INR $($item.amount) [$($item.itemType)]"
            }
        }
        Write-Host ""
    }
}

# Also trigger invoice generation manually if needed
Write-Host "[Step 6b] Triggering invoice generation (dry-run)..." -ForegroundColor Cyan
try {
    $dryRun = Invoke-WebRequest `
        -Uri "$global:KB_URL/1.0/kb/invoices?accountId=$accountId&targetDate=$(Get-Date -Format 'yyyy-MM-dd')&dryRun=true" `
        -Method POST `
        -Headers (KbHeaders "poc-invoice") `
        -Body "{}" `
        -UseBasicParsing

    $preview = $dryRun.Content | ConvertFrom-Json
    Write-Host "[OK] Preview invoice amount: INR $($preview.amount)" -ForegroundColor Green
    Write-Host ($preview | ConvertTo-Json -Depth 6)
} catch {
    Write-Host "[INFO] Dry-run invoice: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n  Next step: run 07-webhook-test.ps1 to test event notifications`n"

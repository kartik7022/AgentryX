#!/usr/bin/env pwsh
# =============================================================
# 02-create-account.ps1
# Creates a Kill Bill customer account (not a tenant).
# Saves the accountId to account-id.txt for use by later steps.
# =============================================================

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/00-setup-tenant.ps1"

Write-Host "`n[Step 2] Creating customer account..." -ForegroundColor Cyan

$body = @{
    name        = "Vinod Trial User"
    externalKey = "vinod_trial_001"
    email       = "vinod@example.com"
    currency    = "INR"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest `
        -Uri "$global:KB_URL/1.0/kb/accounts" `
        -Method POST `
        -Headers (KbHeaders "poc-account") `
        -Body $body `
        -UseBasicParsing

    # Kill Bill returns the new accountId in the Location header
    $accountId = ($response.Headers.Location -split "/")[-1]

    # Persist for next scripts
    $accountId | Set-Content -LiteralPath "$PSScriptRoot/account-id.txt" -Encoding UTF8
    $global:ACCOUNT_ID = $accountId

    Write-Host "[OK] Account created." -ForegroundColor Green
    Write-Host "  AccountId: $accountId"
    Write-Host "  Saved to : account-id.txt"

} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        # Already exists — fetch by externalKey instead
        Write-Host "[INFO] Account already exists. Fetching by externalKey..." -ForegroundColor Yellow
        $existing = Invoke-WebRequest `
            -Uri "$global:KB_URL/1.0/kb/accounts?externalKey=vinod_trial_001" `
            -Method GET `
            -Headers (KbHeaders) `
            -UseBasicParsing
        $accountId = ($existing.Content | ConvertFrom-Json).accountId
        $accountId | Set-Content -LiteralPath "$PSScriptRoot/account-id.txt" -Encoding UTF8
        $global:ACCOUNT_ID = $accountId
        Write-Host "[OK] Existing AccountId: $accountId" -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

Write-Host "`n  Next step: run 03-create-subscriptions.ps1`n"

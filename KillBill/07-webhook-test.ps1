#!/usr/bin/env pwsh
# =============================================================
# 07-webhook-test.ps1
# Registers a webhook URL in Kill Bill so it receives events.
# For local POC: use a free service like webhook.site to capture.
# =============================================================

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/00-setup-tenant.ps1"

# Replace this with your actual webhook URL.
# For local testing get a free URL from https://webhook.site
$WebhookUrl = "https://webhook.site/YOUR-UNIQUE-ID"

Write-Host "`n[Step 7] Registering webhook notification plugin..." -ForegroundColor Cyan
Write-Host "  Target URL: $WebhookUrl"

# Kill Bill uses a per-tenant notification configuration
$body = @{
    type      = "HTTP"
    uri       = $WebhookUrl
    isActive  = $true
    retryDelay= "PT10S"
    maxRetries= 3
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest `
        -Uri "$global:KB_URL/1.0/kb/tenants/registerNotificationCallback?cb=$([Uri]::EscapeDataString($WebhookUrl))" `
        -Method POST `
        -Headers @{
            Authorization          = "Basic $global:KB_BASIC"
            "X-Killbill-ApiKey"    = $global:KB_API_KEY
            "X-Killbill-ApiSecret" = $global:KB_API_SECRET
            "X-Killbill-CreatedBy" = "poc-webhook"
            "Content-Type"         = "application/json"
        } `
        -Body "{}" `
        -UseBasicParsing

    Write-Host "[OK] Webhook registered. HTTP $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Webhook registration: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "       This is fine for local POC — Kill Bill may not have notification plugin installed."
    Write-Host "       Events will still be visible in KAUI at http://localhost:9090"
}

# Verify registration
Write-Host "`n[Step 7b] Checking registered callbacks..." -ForegroundColor Cyan
try {
    $check = Invoke-WebRequest `
        -Uri "$global:KB_URL/1.0/kb/tenants/registerNotificationCallback" `
        -Method GET `
        -Headers (KbHeaders) `
        -UseBasicParsing
    Write-Host "[OK] Registered callbacks:" -ForegroundColor Green
    Write-Host ($check.Content | ConvertFrom-Json | ConvertTo-Json)
} catch {
    Write-Host "[INFO] Could not fetch callbacks: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host @"

============================================================
  WEBHOOK EVENT TYPES TO EXPECT:
  - SUBSCRIPTION_PHASE_CHANGE  (trial -> paid transition)
  - INVOICE_CREATION           (new invoice generated)
  - PAYMENT_SUCCESS            (payment collected)
  - PAYMENT_FAILURE            (payment failed)
  - INVOICE_ADJUSTMENT         (credit/refund applied)

  Your app should respond with HTTP 200 to acknowledge.
  See webhook-listener.js for a ready Node.js handler.
============================================================
"@

Write-Host "`n  Next step: run 08-run-all.ps1 for full end-to-end run`n"

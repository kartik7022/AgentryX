#!/usr/bin/env pwsh
# =============================================================
# 03-create-subscriptions.ps1
# Creates trial subscriptions for Module A, B, and C.
# Saves subscriptionIds to subscription-ids.txt.
# =============================================================

$ErrorActionPreference = "Stop"
. "$PSScriptRoot/00-setup-tenant.ps1"

# Load accountId saved by previous step
$accountIdFile = "$PSScriptRoot/account-id.txt"
if (-not (Test-Path $accountIdFile)) {
    Write-Host "[ERROR] account-id.txt not found. Run 02-create-account.ps1 first." -ForegroundColor Red
    exit 1
}
$accountId = (Get-Content $accountIdFile -Raw).Trim()
Write-Host "`n[Step 3] Creating subscriptions for AccountId: $accountId" -ForegroundColor Cyan

$plans = @(
    @{ module = "ModuleA"; plan = "module-a-trial" },
    @{ module = "ModuleB"; plan = "module-b-trial" },
    @{ module = "ModuleC"; plan = "module-c-trial" }
)

$subscriptionIds = @{}

foreach ($item in $plans) {
    Write-Host "  Creating subscription for $($item.module)..." -ForegroundColor DarkCyan

    $body = @{
        accountId       = $accountId
        planName        = $item.plan
    } | ConvertTo-Json

    try {
        $response = Invoke-WebRequest `
            -Uri "$global:KB_URL/1.0/kb/subscriptions" `
            -Method POST `
            -Headers (KbHeaders "poc-subscriptions") `
            -Body $body `
            -UseBasicParsing

        $subscriptionId = ($response.Headers.Location -split "/")[-1]
        $subscriptionIds[$item.module] = $subscriptionId
        Write-Host "  [OK] $($item.module) subscriptionId: $subscriptionId" -ForegroundColor Green

    } catch {
        Write-Host "  [ERROR] $($item.module): $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            Write-Host "  " + $reader.ReadToEnd() -ForegroundColor DarkRed
        }
    }
}

# Save all subscriptionIds
$subscriptionIds | ConvertTo-Json | Set-Content -LiteralPath "$PSScriptRoot/subscription-ids.json" -Encoding UTF8
Write-Host "`n[OK] All subscriptionIds saved to subscription-ids.json" -ForegroundColor Green
Write-Host ($subscriptionIds | ConvertTo-Json)

Write-Host "`n  Trial periods active:"
Write-Host "    ModuleA: 14 days free"
Write-Host "    ModuleB:  7 days free"
Write-Host "    ModuleC: 10 days free"
Write-Host "`n  Next step: run 04-record-usage.ps1`n"

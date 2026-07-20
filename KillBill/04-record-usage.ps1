$ErrorActionPreference = "Stop"
. "$PSScriptRoot/00-setup-tenant.ps1"

$subs = Get-Content "$PSScriptRoot/subscription-ids.json" -Raw | ConvertFrom-Json
$today = (Get-Date).ToString("yyyy-MM-dd")

Write-Host "`n[Step 4] Recording usage..." -ForegroundColor Cyan

# Module A: 25 calls
Write-Host "`n  Recording 25 calls for ModuleA..." -ForegroundColor DarkCyan

$bodyA = @{
    subscriptionId   = $subs.ModuleA
    trackingId       = "track-a-001"
    unitUsageRecords = @(
        @{
            unitType     = "calls"
            usageRecords = @(
                @{ recordDate = $today; amount = 25 }
            )
        }
    )
} | ConvertTo-Json -Depth 6

$response = Invoke-WebRequest `
    -Uri "$global:KB_URL/1.0/kb/usages" `
    -Method POST `
    -Headers (KbHeaders) `
    -Body $bodyA `
    -UseBasicParsing

Write-Host "  [OK] ModuleA usage recorded. HTTP $($response.StatusCode)" -ForegroundColor Green

# Module C: 200 emails
Write-Host "`n  Recording 200 emails for ModuleC..." -ForegroundColor DarkCyan

$bodyC = @{
    subscriptionId   = $subs.ModuleC
    trackingId       = "track-c-001"
    unitUsageRecords = @(
        @{
            unitType     = "emails"
            usageRecords = @(
                @{ recordDate = $today; amount = 200 }
            )
        }
    )
} | ConvertTo-Json -Depth 6

$response = Invoke-WebRequest `
    -Uri "$global:KB_URL/1.0/kb/usages" `
    -Method POST `
    -Headers (KbHeaders) `
    -Body $bodyC `
    -UseBasicParsing

Write-Host "  [OK] ModuleC usage recorded. HTTP $($response.StatusCode)" -ForegroundColor Green

Write-Host "`n[OK] Usage recording complete!" -ForegroundColor Green
Write-Host "  Next step: run 05-upgrade-to-paid.ps1`n"

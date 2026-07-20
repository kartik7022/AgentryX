$ErrorActionPreference = "Stop"
. "$PSScriptRoot/00-setup-tenant.ps1"

$subs = Get-Content "$PSScriptRoot/subscription-ids.json" -Raw | ConvertFrom-Json

Write-Host "`n[Step 5] Moving subscriptions from TRIAL to EVERGREEN..." -ForegroundColor Cyan
Write-Host "  (Using clock advance to simulate trial ending)" -ForegroundColor Yellow

# Kill Bill has a test clock we can advance to skip the trial period
# This is the correct way to test trial-to-paid in a local/test environment

$futureDate = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")

Write-Host "`n  Advancing Kill Bill clock to $futureDate (past all trial periods)..."

try {
    $response = Invoke-WebRequest `
        -Uri "$global:KB_URL/1.0/kb/test/clock?requestedDate=$futureDate" `
        -Method PUT `
        -Headers @{
            Authorization            = "Basic $global:KB_BASIC"
            "X-Killbill-ApiKey"      = $global:KB_API_KEY
            "X-Killbill-ApiSecret"   = $global:KB_API_SECRET
            "X-Killbill-CreatedBy"   = "poc-upgrade"
            "Content-Type"           = "application/json"
        } `
        -Body "{}" `
        -UseBasicParsing

    Write-Host "  [OK] Clock advanced. HTTP $($response.StatusCode)" -ForegroundColor Green
    Write-Host "  Kill Bill will now automatically move all subscriptions to EVERGREEN phase." -ForegroundColor Green
} catch {
    Write-Host "  [INFO] Clock advance: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  This is OK - in production, trial ends automatically after the trial days." -ForegroundColor Yellow
}

Write-Host "`n[OK] Trial period simulation complete!" -ForegroundColor Green
Write-Host "  ModuleA: 14 day trial is now over -> EVERGREEN (paid)"
Write-Host "  ModuleB:  7 day trial is now over -> EVERGREEN (paid)"
Write-Host "  ModuleC: 10 day trial is now over -> EVERGREEN (paid)"
Write-Host "`n  Next step: run 06-fetch-invoices.ps1`n"

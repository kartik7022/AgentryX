$ErrorActionPreference = "Stop"
. "$PSScriptRoot/00-setup-tenant.ps1"

$catalogFile = Join-Path $PSScriptRoot "catalog.xml"

Write-Host "`n[Step 1] Uploading catalog.xml..." -ForegroundColor Cyan

$xmlContent = Get-Content -LiteralPath $catalogFile -Raw

try {
    $response = Invoke-WebRequest `
        -Uri "$global:KB_URL/1.0/kb/catalog/xml" `
        -Method POST `
        -Headers @{
            Authorization            = "Basic $global:KB_BASIC"
            "X-Killbill-ApiKey"      = $global:KB_API_KEY
            "X-Killbill-ApiSecret"   = $global:KB_API_SECRET
            "X-Killbill-CreatedBy"   = "poc-catalog"
            "Accept"                 = "application/json"
            "Content-Type"           = "text/xml; charset=utf-8"
        } `
        -Body $xmlContent `
        -UseBasicParsing

    Write-Host "[OK] Catalog uploaded. HTTP $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        Write-Host $reader.ReadToEnd() -ForegroundColor DarkRed
    }
    exit 1
}

Write-Host "`n[Step 1b] Verifying catalog..." -ForegroundColor Cyan
$verify = Invoke-WebRequest `
    -Uri "$global:KB_URL/1.0/kb/catalog/availableBasePlans" `
    -Method GET `
    -Headers @{
        Authorization            = "Basic $global:KB_BASIC"
        "X-Killbill-ApiKey"      = $global:KB_API_KEY
        "X-Killbill-ApiSecret"   = $global:KB_API_SECRET
        "Accept"                 = "application/json"
    } `
    -UseBasicParsing

$plans = $verify.Content | ConvertFrom-Json
Write-Host "[OK] Plans in Kill Bill:" -ForegroundColor Green
foreach ($p in $plans) {
    Write-Host "  - $($p.planName)"
}

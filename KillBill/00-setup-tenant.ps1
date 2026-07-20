$ErrorActionPreference = "Stop"

$KB           = "http://localhost:8080"
$AdminUser    = "admin"
$AdminPass    = "password"
$ApiKey       = "company_a"
$ApiSecret    = "company_a_secret"

Write-Host "`n[Step 0] Creating tenant in Kill Bill..." -ForegroundColor Cyan

$basicAuth = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("${AdminUser}:${AdminPass}")
)

$body = '{"apiKey":"company_a","apiSecret":"company_a_secret"}'

try {
    $response = Invoke-WebRequest `
        -Uri "$KB/1.0/kb/tenants?useGlobalDefault=true" `
        -Method POST `
        -Headers @{
            Authorization          = "Basic $basicAuth"
            "Content-Type"         = "application/json"
            "X-Killbill-CreatedBy" = "poc-setup"
        } `
        -Body $body `
        -UseBasicParsing

    $tenantId = ($response.Headers.Location -split "/")[-1]
    Write-Host "[OK] Tenant created. TenantId: $tenantId" -ForegroundColor Green
} catch {
    Write-Host "[INFO] Tenant may already exist - continuing." -ForegroundColor Yellow
}

$global:KB_URL        = $KB
$global:KB_API_KEY    = $ApiKey
$global:KB_API_SECRET = $ApiSecret
$global:KB_BASIC      = $basicAuth

function global:KbHeaders {
    return @{
        Authorization            = "Basic $global:KB_BASIC"
        "Content-Type"           = "application/json"
        "X-Killbill-ApiKey"      = $global:KB_API_KEY
        "X-Killbill-ApiSecret"   = $global:KB_API_SECRET
        "X-Killbill-CreatedBy"   = "poc"
    }
}

Write-Host "[OK] Tenant config ready. API Key: $ApiKey" -ForegroundColor Green

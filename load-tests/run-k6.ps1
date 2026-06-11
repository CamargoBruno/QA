# Uso: .\load-tests\run-k6.ps1 login
#       .\load-tests\run-k6.ps1 upload-midia

param(
    [Parameter(Mandatory=$true)]
    [string]$Test
)

$envFile = Join-Path $PSScriptRoot "..\\.env"
$testFile = Join-Path $PSScriptRoot "$Test.k6.js"

if (-not (Test-Path $testFile)) {
    Write-Error "Teste nao encontrado: $testFile"
    exit 1
}

# Carrega variaveis do .env
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $key, $value = $line -split '=', 2
    [System.Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim(), 'Process')
}

Write-Host "Iniciando: $Test.k6.js" -ForegroundColor Cyan

k6 run `
    --env TEST_EMAIL=$env:TEST_EMAIL `
    --env TEST_PASSWORD=$env:TEST_PASSWORD `
    --env CAPTCHA_TOKEN=$env:CAPTCHA_TOKEN `
    $testFile

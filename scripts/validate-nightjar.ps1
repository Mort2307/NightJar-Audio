Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-NightjarStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [Parameter(Mandatory = $true)][string]$LogFile
    )

    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan

    $global:LASTEXITCODE = 0
    $output = & $Action 2>&1
    $exitCode = $LASTEXITCODE

    if ($null -ne $output) {
        $output |
            Tee-Object -FilePath $LogFile -Append |
            ForEach-Object { Write-Host $_ }
    }

    if ($exitCode -ne 0) {
        Write-Host ""
        Write-Host "$Name FAILED (exit code $exitCode)" -ForegroundColor Red
        Write-Host "Validation stopped at the first failing step." -ForegroundColor Yellow
        Write-Host "PowerShell remains open." -ForegroundColor Yellow
        Write-Host "Log saved to: $LogFile" -ForegroundColor Yellow
        return $false
    }

    Write-Host "$Name PASSED" -ForegroundColor Green
    return $true
}

function Invoke-NightjarFullValidation {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    Set-Location $repoRoot

    $logFile = Join-Path $repoRoot "nightjar-validation.log"
    if (Test-Path $logFile) {
        Remove-Item $logFile -Force
    }

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host " NIGHTJAR FULL DEVELOPMENT VALIDATION" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan

    if (-not (Invoke-NightjarStep "PULLING LATEST NIGHTJAR" { git pull --ff-only origin main } $logFile)) { return $false }

    Write-Host ""
    Write-Host "=== CURRENT REVISION ===" -ForegroundColor Cyan
    git log -1 --oneline

    Write-Host ""
    Write-Host "=== REPOSITORY STATUS ===" -ForegroundColor Cyan
    git status --short

    if (-not (Invoke-NightjarStep "INSTALLING APP DEPENDENCIES" { npm install } $logFile)) { return $false }
    if (-not (Invoke-NightjarStep "TYPESCRIPT CHECK" { npm run typecheck } $logFile)) { return $false }
    if (-not (Invoke-NightjarStep "VITE PRODUCTION BUILD" { npm run build } $logFile)) { return $false }
    if (-not (Invoke-NightjarStep "PRODUCT / ACCESSIBILITY / SECURITY CONTRACTS" { npm run validate:contracts } $logFile)) { return $false }
    if (-not (Invoke-NightjarStep "COMMUNITY CONTRACTS" { npm run validate:community } $logFile)) { return $false }
    if (-not (Invoke-NightjarStep "BUNDLE BUDGET" { npm run validate:bundle } $logFile)) { return $false }

    Write-Host ""
    Write-Host "=== FIREBASE FUNCTIONS ===" -ForegroundColor Cyan

    Push-Location (Join-Path $repoRoot "functions")
    try {
        if (-not (Invoke-NightjarStep "INSTALLING FUNCTIONS DEPENDENCIES" { npm install } $logFile)) { return $false }
        if (-not (Invoke-NightjarStep "FUNCTIONS TYPESCRIPT CHECK" { npm run check } $logFile)) { return $false }
        if (-not (Invoke-NightjarStep "FUNCTIONS PRODUCTION BUILD" { npm run build } $logFile)) { return $false }
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " NIGHTJAR FULL BUILD VALIDATED" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Validation log:" -ForegroundColor Cyan
    Write-Host $logFile

    return $true
}

$success = Invoke-NightjarFullValidation

if (-not $success) {
    Write-Host ""
    Write-Host "NIGHTJAR VALIDATION DID NOT PASS." -ForegroundColor Red
    Write-Host "Fix the failing step above, then run this script again." -ForegroundColor Yellow
}

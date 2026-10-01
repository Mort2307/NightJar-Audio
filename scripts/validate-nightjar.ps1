$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

function Invoke-NightjarStep {
    param(
        [Parameter(Mandatory=$true)][string]$Title,
        [Parameter(Mandatory=$true)][scriptblock]$Command
    )

    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan

    & $Command

    if ($LASTEXITCODE -ne 0) {
        throw "$Title failed with exit code $LASTEXITCODE."
    }
}

try {
    Invoke-NightjarStep -Title "CURRENT VERSION" -Command {
        git log -1 --oneline
    }

    Invoke-NightjarStep -Title "INSTALLING APP DEPENDENCIES" -Command {
        npm install
    }

    Invoke-NightjarStep -Title "RUNNING COMPLETE NIGHTJAR VALIDATION" -Command {
        npm run validate
    }

    Push-Location (Join-Path $repoRoot "functions")
    try {
        Invoke-NightjarStep -Title "INSTALLING FIREBASE FUNCTIONS DEPENDENCIES" -Command {
            npm install
        }

        Invoke-NightjarStep -Title "VALIDATING FIREBASE FUNCTIONS" -Command {
            npm run check
        }

        if ((Get-Content package.json -Raw) -match '"audit:guard"') {
            Invoke-NightjarStep -Title "AUDITING FIREBASE FUNCTIONS PRODUCTION DEPENDENCIES" -Command {
                npm run audit:guard
            }
        }
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " NIGHTJAR FULL BUILD PASSED" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green

    Write-Host ""
    Write-Host "Repository status:" -ForegroundColor Cyan
    git status --short

    Write-Host ""
    Write-Host "Current revision:" -ForegroundColor Cyan
    git log -1 --oneline
}
catch {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Red
    Write-Host " NIGHTJAR VALIDATION FAILED" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    Write-Host ""
    Write-Host "No success banner has been emitted for this failed run." -ForegroundColor Yellow
    exit 1
}
finally {
    Pop-Location
}

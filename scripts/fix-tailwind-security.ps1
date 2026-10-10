# Nightjar: controlled Tailwind v3 -> v4 security remediation.
# Run from a PowerShell terminal: & .\scripts\fix-tailwind-security.ps1
# Intentionally does NOT commit, push, merge or deploy.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function RunChecked([string]$Program, [string[]]$CommandArgs) {
    & $Program @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "$Program $($CommandArgs -join ' ') failed (exit $LASTEXITCODE)."
    }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
Write-Host "NIGHTJAR - TAILWIND SECURITY MIGRATION" -ForegroundColor Cyan

$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine Git branch.' }
if ($branch -ne 'feature/self-service-professional-roles-20261010') {
    throw "Expected feature/self-service-professional-roles-20261010, found '$branch'. Refusing to change another branch."
}

$testFile = Get-Content '.\scripts\professional-application-bank-contracts.mjs' -Raw
if (-not $testFile.Contains('approval delivery has a distinct labelled field')) {
    throw 'Your local checkout lacks the updated approval tests. Pull the latest feature branch first.'
}

$files = @('package.json', 'package-lock.json', 'postcss.config.js', 'src/index.css')
$backup = Join-Path $env:TEMP ('Nightjar-Tailwind4-Backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null

foreach ($file in $files) {
    $source = Join-Path $root $file
    if (-not (Test-Path $source)) { throw "Required file missing: $file" }
    $target = Join-Path $backup $file
    $parent = Split-Path $target -Parent
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
}
Write-Host "Original files backed up: $backup"

$writer = [System.Text.UTF8Encoding]::new($false)
try {
    $cssFile = Join-Path $root 'src/index.css'
    $css = [System.IO.File]::ReadAllText($cssFile)
    $legacyHeader = '(?s)\A\uFEFF?@tailwind base;\s*@tailwind components;\s*@tailwind utilities;\s*'
    if (-not [regex]::IsMatch($css, $legacyHeader)) {
        throw 'Tailwind v3 header was not found at start of src/index.css. No migration attempted.'
    }

    $newHeader = '@import "tailwindcss";' + "`n" +
                 '@config "../tailwind.config.js";' + "`n" +
                 '@source "../index.html";' + "`n" +
                 '@source "./";' + "`n`n"
    $headerMatch = [regex]::Match($css, $legacyHeader)
    $css = $newHeader + $css.Substring($headerMatch.Length)
    [System.IO.File]::WriteAllText($cssFile, $css, $writer)

    $postcssFile = Join-Path $root 'postcss.config.js'
    $postcssConfig = @'
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
'@
    [System.IO.File]::WriteAllText($postcssFile, $postcssConfig + "`n", $writer)

    Write-Host 'Installing Tailwind 4 and its PostCSS adapter...' -ForegroundColor Cyan
    RunChecked 'npm' @('install', '--save-dev', '--save-exact', 'tailwindcss@4.3.3', '@tailwindcss/postcss@4.3.3')
    RunChecked 'npm' @('uninstall', '--save-dev', 'autoprefixer')

    Write-Host 'Checking all dependency advisories (dev + production)...' -ForegroundColor Cyan
    RunChecked 'npm' @('audit', '--audit-level=moderate')
    RunChecked 'npm' @('audit', '--omit=dev', '--audit-level=moderate')

    Write-Host 'Verifying reproducible lockfile installation...' -ForegroundColor Cyan
    RunChecked 'npm' @('ci')

    Write-Host 'Running the complete Nightjar validation pipeline...' -ForegroundColor Cyan
    RunChecked 'npm' @('run', 'validate')

    Write-Host 'Checking Git patch formatting...' -ForegroundColor Cyan
    RunChecked 'git' @('diff', '--check')

    Write-Host ''
    Write-Host 'SUCCESS: Full audit and Nightjar validation passed.' -ForegroundColor Green
    Write-Host 'IMPORTANT: Review the redesigned CSS visually before merging or deploying.' -ForegroundColor Yellow
    Write-Host 'Changed files:' -ForegroundColor Cyan
    & git status --short
    if ($LASTEXITCODE -ne 0) { throw 'Git status check failed.' }
}
catch {
    $failure = $_.Exception.Message
    Write-Warning "Migration failed: $failure"
    Write-Host 'Restoring original project files...' -ForegroundColor Yellow
    foreach ($file in $files) {
        Copy-Item -LiteralPath (Join-Path $backup $file) -Destination (Join-Path $root $file) -Force
    }
    try {
        Write-Host 'Restoring original npm dependencies from backed-up lockfile...' -ForegroundColor Yellow
        RunChecked 'npm' @('ci')
    }
    catch {
        Write-Warning "Dependency reinstall failed; files were restored. Inspect $backup."
    }
    Write-Host "NOT COMPLETE. Original files preserved in $backup" -ForegroundColor Red
    exit 1
}

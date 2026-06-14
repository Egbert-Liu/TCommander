# TCommander Windows build script
# Workaround for winCodeSign symlink + rename issues:
#   1. Pre-populate winCodeSign-2.6.0 cache dir (skip download/extract/rename)
#   2. 7za.cmd wrapper masks macOS dylib symlink errors for other tools
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "=== TCommander Build ===" -ForegroundColor Cyan

# 1. Prepare 7za wrapper (masks symlink extraction errors)
$toolsDir = Join-Path $projectRoot ".tools"
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
$real7za = Join-Path $toolsDir "real-7za.exe"
if (-not (Test-Path $real7za)) {
    Copy-Item "node_modules\7zip-bin\win\x64\7za.exe" $real7za -Force
}

# 2. Pre-populate winCodeSign-2.6.0 cache (avoids download/extract/rename failures)
$cacheBase = Join-Path $projectRoot ".ebcache\winCodeSign"
$targetDir = Join-Path $cacheBase "winCodeSign-2.6.0"
if (-not (Test-Path (Join-Path $targetDir "rcedit-x64.exe"))) {
    Write-Host "[..] Pre-populating winCodeSign-2.6.0..." -ForegroundColor Yellow
    # Find a complete extraction in AppData
    $appDataCache = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
    $sourceDir = $null
    if (Test-Path $appDataCache) {
        Get-ChildItem $appDataCache -Directory | Where-Object { $_.Name -match "^\d+$" } | ForEach-Object {
            if (-not $sourceDir) {
                $rcedit = Join-Path $_.FullName "rcedit-x64.exe"
                if (Test-Path $rcedit) { $sourceDir = $_.FullName }
            }
        }
    }
    if ($sourceDir) {
        if (Test-Path $cacheBase) { Remove-Item $cacheBase -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $cacheBase | Out-Null
        Copy-Item $sourceDir $targetDir -Recurse -Force
        Write-Host "[OK] Pre-populated from: $sourceDir" -ForegroundColor Green
    } else {
        Write-Host "[WARN] No complete winCodeSign source found in AppData" -ForegroundColor Yellow
    }
} else {
    Write-Host "[SKIP] winCodeSign-2.6.0 already populated" -ForegroundColor Yellow
}

# 2b. Pre-populate nsis-3.0.4.1 cache (avoids same rename permission issue)
# electron-builder's nsis-3.0.4.1.7z contains base NSIS + custom plugins (UAC.dll etc.)
# Extraction created two separate hash dirs: one with makensis.exe, one with plugins/
$nsisBase = Join-Path $projectRoot ".ebcache\nsis"
$nsisTarget = Join-Path $nsisBase "nsis-3.0.4.1"
$needNsis = -not (Test-Path (Join-Path $nsisTarget "elevate.exe")) -or -not (Test-Path (Join-Path $nsisTarget "Plugins\x86-unicode\UAC.dll"))
if ($needNsis) {
    Write-Host "[..] Pre-populating nsis-3.0.4.1..." -ForegroundColor Yellow
    # Find base NSIS dir (has makensis.exe) and plugins dir (has UAC.dll)
    $baseDir = $null
    $pluginDir = $null
    if (Test-Path $nsisBase) {
        Get-ChildItem $nsisBase -Directory | Where-Object { $_.Name -match "^\d+$" } | ForEach-Object {
            if (-not $baseDir -and (Test-Path (Join-Path $_.FullName "makensis.exe"))) {
                $baseDir = $_.FullName
            }
            if (-not $pluginDir -and (Test-Path (Join-Path $_.FullName "plugins\x86-unicode\UAC.dll"))) {
                $pluginDir = $_.FullName
            }
        }
    }
    if ($baseDir) {
        # Copy base NSIS to target
        if (Test-Path $nsisTarget) { Remove-Item $nsisTarget -Recurse -Force }
        Copy-Item $baseDir $nsisTarget -Recurse -Force
        Write-Host "[OK] Base NSIS from: $baseDir" -ForegroundColor Green
        # Merge custom plugins (UAC.dll, nsProcess.dll, etc.)
        if ($pluginDir) {
            $srcPlugins = Join-Path $pluginDir "plugins"
            if (Test-Path $srcPlugins) {
                Get-ChildItem $srcPlugins -Directory | ForEach-Object {
                    $dstArch = Join-Path $nsisTarget "Plugins\$($_.Name)"
                    New-Item -ItemType Directory -Force -Path $dstArch | Out-Null
                    Copy-Item (Join-Path $_.FullName "*") $dstArch -Recurse -Force
                }
                Write-Host "[OK] Custom plugins from: $pluginDir" -ForegroundColor Green
            }
        } else {
            Write-Host "[WARN] No plugins dir (UAC.dll) found - installer may fail" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARN] No base NSIS source found" -ForegroundColor Yellow
    }
} else {
    Write-Host "[SKIP] nsis-3.0.4.1 already populated with plugins" -ForegroundColor Yellow
}

# 3. Set environment variables
# NOTE: Do NOT set USE_SYSTEM_7ZA - it makes 7zip-bin return bare "7za" which
# Node's spawn cannot resolve (no .cmd/.exe extension). Since both caches are
# pre-populated, no extraction happens, so the bundled 7za.exe path works fine.
$env:ELECTRON_BUILDER_CACHE = Join-Path $projectRoot ".ebcache"
Write-Host "[OK] Env vars set" -ForegroundColor Green

# 4. Run build
Write-Host "=== Building ===" -ForegroundColor Cyan
npm run dist:win
$buildExit = $LASTEXITCODE
if ($buildExit -eq 0) {
    Write-Host "=== Build SUCCESS ===" -ForegroundColor Green
    Get-ChildItem "release" -Filter "TCommander*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host ("  Output: {0} ({1} MB)" -f $_.FullName, [math]::Round($_.Length/1MB,1)) -ForegroundColor Green
    }
} else {
    Write-Host "=== Build FAILED (exit $buildExit) ===" -ForegroundColor Red
    exit $buildExit
}

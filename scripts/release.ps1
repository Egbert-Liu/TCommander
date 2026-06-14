param(
  [Parameter(Mandatory=$true)][string]$Token,
  [Parameter(Mandatory=$true)][string]$ExePath
)

$ErrorActionPreference = "Stop"
$headers = @{
  Authorization = "Bearer $Token"
  Accept = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

# Release 说明
$notes = @"
# TCommander V0.1.0

First release of TCommander.

## Features
- Multi-terminal session management: card view to monitor multiple CLI processes
- Groups & sessions: sidebar group management, quick switching
- Real-time terminal output: based on xterm.js with ANSI color support
- Command presets: reuse common commands with one click
- Theme support: light/dark mode adaptive, multiple terminal color schemes
- Custom title bar: no white border, unified dark style
- App icon: dedicated TCommander icon

## Install
Download 'TCommander-Setup-0.1.0.exe' below and run the installer.

## Requirements
- Windows 10/11 (x64)
"@

$body = @{
  tag_name = "v0.1.0"
  name = "V0.1.0"
  body = $notes
  draft = $false
  prerelease = $false
} | ConvertTo-Json -Depth 5

Write-Host "[..] Creating release V0.1.0..." -ForegroundColor Cyan
try {
  $resp = Invoke-RestMethod -Uri "https://api.github.com/repos/Egbert-Liu/TCommander/releases" `
    -Method Post -Headers $headers -Body $body -ContentType "application/json; charset=utf-8"
} catch {
  Write-Host "[ERR] Create release failed: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
  exit 1
}

$releaseId = $resp.id
$uploadUrl = $resp.upload_url -replace '\{\?name,label\}', ''
Write-Host "[OK] Release created: id=$releaseId, html_url=$($resp.html_url)" -ForegroundColor Green

# 上传 exe asset
$assetName = "TCommander-Setup-0.1.0.exe"
$bytes = [System.IO.File]::ReadAllBytes($ExePath)
Write-Host "[..] Uploading $assetName ($([math]::Round($bytes.Length/1MB,2)) MB)..." -ForegroundColor Cyan

$assetHeaders = @{
  Authorization = "Bearer $Token"
  Accept = "application/vnd.github+json"
  "Content-Type" = "application/octet-stream"
}
$uploadUri = "$uploadUrl`?name=$assetName"

try {
  $assetResp = Invoke-RestMethod -Uri $uploadUri -Method Post -Headers $assetHeaders -Body $bytes
  Write-Host "[OK] Asset uploaded: $($assetResp.browser_download_url)" -ForegroundColor Green
} catch {
  Write-Host "[ERR] Upload asset failed: $($_.Exception.Message)" -ForegroundColor Red
  if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
  exit 1
}

Write-Host ""
Write-Host "=== Release V0.1.0 published successfully ===" -ForegroundColor Green
Write-Host "  Release page: $($resp.html_url)" -ForegroundColor Green

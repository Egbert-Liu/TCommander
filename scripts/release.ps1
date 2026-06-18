param(
  [Parameter(Mandatory=$true)][string]$Token,
  [Parameter(Mandatory=$true)][string]$ExePath,
  [Parameter(Mandatory=$true)][string]$Version,
  [string]$Notes = "",
  [switch]$Prerelease
)

$ErrorActionPreference = "Stop"
$repo = "Egbert-Liu/TCommander"
$tag = "v$Version"
$releaseName = "V$Version"
$assetName = [System.IO.Path]::GetFileName($ExePath)

if (-not (Test-Path $ExePath)) {
  Write-Host "[ERR] Exe not found: $ExePath" -ForegroundColor Red
  exit 1
}

$headers = @{
  Authorization = "Bearer $Token"
  Accept = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

# Idempotent: check if release already exists for the tag; reuse its upload_url if so
$uploadUrl = $null
$releaseId = $null
$releaseHtmlUrl = $null

try {
  $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/tags/$tag" -Method Get -Headers $headers
  $releaseId = $existing.id
  $releaseHtmlUrl = $existing.html_url
  $uploadUrl = $existing.upload_url -replace '\{\?name,label\}', ''
  Write-Host "[OK] Release already exists: id=$releaseId, will reuse and overwrite assets." -ForegroundColor Yellow
} catch {
  # 404 means no release for this tag yet; create a new one
  if ([string]::IsNullOrWhiteSpace($Notes)) {
    $notesBody = "# TCommander $releaseName`n`nRelease $releaseName."
  } else {
    $notesBody = $Notes
  }

  $body = @{
    tag_name = $tag
    name = $releaseName
    body = $notesBody
    draft = $false
    prerelease = [bool]$Prerelease
  } | ConvertTo-Json -Depth 5

  Write-Host "[..] Creating release $releaseName ($tag)..." -ForegroundColor Cyan
  $resp = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases" `
    -Method Post -Headers $headers -Body $body -ContentType "application/json; charset=utf-8"
  $releaseId = $resp.id
  $releaseHtmlUrl = $resp.html_url
  $uploadUrl = $resp.upload_url -replace '\{\?name,label\}', ''
  Write-Host "[OK] Release created: id=$releaseId" -ForegroundColor Green
}

# Overwrite same-name asset: delete old one first (GitHub requires unique asset names)
try {
  $assets = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/$releaseId/assets" -Method Get -Headers $headers
  foreach ($a in $assets) {
    if ($a.name -eq $assetName) {
      Write-Host "[..] Removing existing asset '$assetName' (id=$($a.id))..." -ForegroundColor Yellow
      Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/assets/$($a.id)" -Method Delete -Headers $headers | Out-Null
    }
  }
} catch {
  Write-Host "[!] List/delete existing assets failed (will try upload anyway): $($_.Exception.Message)" -ForegroundColor Yellow
}

# Upload exe asset
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
Write-Host "=== Release $releaseName published successfully ===" -ForegroundColor Green
Write-Host "  Release page: $releaseHtmlUrl" -ForegroundColor Green

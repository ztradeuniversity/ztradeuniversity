<#
  ZTU WAREHOUSE SYNC  —  run at the START of every work session.
  ------------------------------------------------------------------------------
  Root cause of the recurring reverts: the warehouse (D:\website) had no way to
  receive production changes, so it drifted behind and copies from it reverted
  production. This script REFRESHES the warehouse to exactly match production and
  records a manifest of that baseline, so publish-from-warehouse can later copy
  ONLY the files you actually edit this session (never stale files).

  Usage (PowerShell):
      ./scripts/warehouse-sync.ps1
      # then edit your feature in D:\website, and run publish-from-warehouse.ps1

  Safe: never touches .git, client PII, or backups. Preserves nothing stale.
#>
param(
  [string]$Prod = "D:\ztradeuniversity",
  [string]$Ware = "D:\website"
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path "$Prod\.git")) { throw "Production repo not found at $Prod" }
if (-not (Test-Path $Ware))        { New-Item -ItemType Directory -Path $Ware | Out-Null }

Write-Host "ZTU warehouse-sync: refreshing $Ware from production ($Prod)..." -ForegroundColor Cyan

# Tracked files in production (respects .gitignore → PII/backups already excluded).
$tracked = & git -C $Prod ls-files
if ($LASTEXITCODE -ne 0) { throw "git ls-files failed in $Prod" }

$manifest = @{}
$copied = 0
foreach ($rel in $tracked) {
  $src = Join-Path $Prod $rel
  $dst = Join-Path $Ware $rel
  if (-not (Test-Path $src)) { continue }
  $dstDir = Split-Path $dst -Parent
  if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
  Copy-Item $src $dst -Force
  $manifest[$rel] = (Get-FileHash $dst -Algorithm SHA256).Hash
  $copied++
}

# Record the synced baseline so publish knows what YOU changed vs what was synced.
$manifestPath = Join-Path $Ware ".warehouse-sync.json"
[pscustomobject]@{
  syncedAt  = (Get-Date).ToString("o")
  prodHead  = (& git -C $Prod rev-parse HEAD)
  files     = $manifest
} | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath -Encoding utf8

Write-Host "OK  synced $copied files. Warehouse now matches production." -ForegroundColor Green
Write-Host "    baseline manifest: $manifestPath" -ForegroundColor DarkGray
Write-Host "    -> edit your feature in $Ware, then run publish-from-warehouse.ps1" -ForegroundColor DarkGray

<#
  ZTU PUBLISH FROM WAREHOUSE  —  run when your feature is finished.
  ------------------------------------------------------------------------------
  Copies to production ONLY the files you actually changed this session (diffed
  against the baseline that warehouse-sync recorded). Files you did NOT touch are
  never copied, so a stale warehouse can never revert production. This is the
  permanent fix for the recurring-revert / false-positive-block problem.

  Usage (PowerShell):
      ./scripts/publish-from-warehouse.ps1                 # copy edits into the repo
      ./scripts/publish-from-warehouse.ps1 -Commit "msg"   # also commit + push (hook runs)

  If you commit/push via GitHub Desktop instead, just run without -Commit, then
  commit in GitHub Desktop as usual — only your real edits will be staged.
#>
param(
  [string]$Prod   = "D:\ztradeuniversity",
  [string]$Ware   = "D:\website",
  [string]$Commit = ""
)
$ErrorActionPreference = "Stop"
$manifestPath = Join-Path $Ware ".warehouse-sync.json"
if (-not (Test-Path $manifestPath)) {
  throw "No sync baseline found. Run ./scripts/warehouse-sync.ps1 FIRST (before editing)."
}
$baseline = Get-Content $manifestPath -Raw | ConvertFrom-Json
$baseHashes = @{}; foreach ($p in $baseline.files.PSObject.Properties) { $baseHashes[$p.Name] = $p.Value }

# Files that differ from the synced baseline = YOUR edits this session.
$changed = @()
foreach ($rel in $baseHashes.Keys) {
  $w = Join-Path $Ware $rel
  if (-not (Test-Path $w)) { continue }
  $h = (Get-FileHash $w -Algorithm SHA256).Hash
  if ($h -ne $baseHashes[$rel]) { $changed += $rel }
}
# New files created in the warehouse this session (not in baseline, not ignored paths).
Get-ChildItem $Ware -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($Ware.Length).TrimStart('\','/') -replace '\\','/'
  if ($rel -like ".git/*" -or $rel -eq ".warehouse-sync.json") { return }
  if ($rel -like "admin/data/*" -or $rel -like "automation/mailing_lists/*") { return }
  if (-not $baseHashes.ContainsKey($rel)) { $changed += $rel }
}

if ($changed.Count -eq 0) { Write-Host "No changes since last sync — nothing to publish." -ForegroundColor Yellow; return }

Write-Host "Publishing $($changed.Count) changed file(s) to production:" -ForegroundColor Cyan
foreach ($rel in $changed) {
  $src = Join-Path $Ware $rel; $dst = Join-Path $Prod $rel
  $dstDir = Split-Path $dst -Parent
  if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
  Copy-Item $src $dst -Force
  Write-Host "  + $rel" -ForegroundColor DarkGray
}

Push-Location $Prod
try {
  & git add -- $changed
  if ($Commit -ne "") {
    & git commit -m $Commit                         # pre-push hook still runs on push
    if ($LASTEXITCODE -ne 0) { throw "commit failed" }
    & git push origin HEAD:main                     # regression hook is the final gate
    if ($LASTEXITCODE -ne 0) { throw "push blocked/failed — see hook output above" }
    Write-Host "OK  committed + pushed. Cloudflare will deploy." -ForegroundColor Green
  } else {
    Write-Host "OK  copied your edits into $Prod and staged them." -ForegroundColor Green
    Write-Host "    Commit + push via GitHub Desktop (only your edits are staged)." -ForegroundColor DarkGray
  }
} finally { Pop-Location }

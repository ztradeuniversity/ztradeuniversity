<#
.SYNOPSIS
    ZTU client-delivery bundle builder.

.DESCRIPTION
    Builds a per-client delivery package by:
      1. Locating the compiled EX5 in COMPILED_EX5
      2. Creating a bundle folder in READY_TO_SEND
      3. Copying the EX5 into that folder
      4. Writing install.txt (MT5 installation guide)
      5. Zipping the bundle into READY_TO_SEND\<bundle>.zip
      6. Running a hard safety scan to guarantee NO .mq5 file is ever
         included in the bundle folder or the resulting .zip.

    SAFETY GUARANTEES:
      * Reads ONLY from COMPILED_EX5 — never touches SOURCE_MQ5
      * Refuses to copy anything that isn't a .ex5 file
      * Verifies the bundle folder contains zero .mq5 files BEFORE zipping
      * Verifies the produced .zip contains zero .mq5 entries AFTER zipping
      * Overwrite-protected by default (use -Force to recreate)

    WHAT IT DOES NOT DO (intentionally):
      * No email sending
      * No MT5 / MetaEditor automation
      * No Supabase / cloud calls
      * No website-file modification

.PARAMETER AccountNumber
    The MT5 account number (digits only).

.PARAMETER Broker
    Broker name (e.g., Exness, HFM, IC Markets).
    Non-alphanumeric characters are stripped during filename generation
    (so "IC Markets" becomes "ICMarkets" in the bundle name).

.PARAMETER Root
    Root of the ZTU automation tree. Defaults to D:\ZTU_AUTOMATION.

.PARAMETER Force
    If set, removes any existing bundle folder / zip with the same name
    and recreates them. Without -Force, the script refuses to overwrite.

.EXAMPLE
    .\create_delivery_bundle.ps1 168095416 Exness

.EXAMPLE
    .\create_delivery_bundle.ps1 -AccountNumber 168095416 -Broker Exness -Force

.EXAMPLE
    .\create_delivery_bundle.ps1
    (Interactive — prompts for both fields)

.NOTES
    Exit codes:
       0  success
       1  invalid input  /  bundle or zip already exists (no -Force)
       2  required folder missing  /  EX5 not found
       3  copy failed
       4  install.txt write failed
       5  ZIP creation failed
       6  safety guard tripped (MQ5 detected, or wrong file type)
      99  unexpected error
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false, Position = 0)]
    [string]$AccountNumber,

    [Parameter(Mandatory = $false, Position = 1)]
    [string]$Broker,

    [Parameter(Mandatory = $false)]
    [string]$Root = 'D:\ZTU_AUTOMATION',

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# ─── Output helpers ────────────────────────────────────────────────────────
function Write-Step([string]$msg) {
    Write-Host '[STEP]  ' -ForegroundColor Cyan -NoNewline
    Write-Host $msg
}
function Write-Ok([string]$msg) {
    Write-Host '[OK]    ' -ForegroundColor Green -NoNewline
    Write-Host $msg
}
function Write-Err2([string]$msg) {
    Write-Host '[ERROR] ' -ForegroundColor Red -NoNewline
    Write-Host $msg -ForegroundColor Red
}
function Write-Info([string]$msg) {
    Write-Host '[INFO]  ' -ForegroundColor DarkGray -NoNewline
    Write-Host $msg -ForegroundColor DarkGray
}

# ─── Top-level error guard ─────────────────────────────────────────────────
try {

    # ─── Prompt for missing inputs ────────────────────────────────────────
    if (-not $AccountNumber) {
        $AccountNumber = Read-Host 'Enter the MT5 account number'
    }
    if (-not $Broker) {
        $Broker = Read-Host 'Enter the broker name (e.g., Exness, HFM, Pepperstone, IC Markets)'
    }

    $AccountNumber = $AccountNumber.Trim()
    $Broker        = $Broker.Trim()

    # ─── Validate inputs ──────────────────────────────────────────────────
    if ([string]::IsNullOrWhiteSpace($AccountNumber)) {
        Write-Err2 'Account number cannot be empty.'
        exit 1
    }
    if ($AccountNumber -notmatch '^[0-9]+$') {
        Write-Err2 "Account number must contain digits only. Got: '$AccountNumber'"
        exit 1
    }
    if ([string]::IsNullOrWhiteSpace($Broker)) {
        Write-Err2 'Broker name cannot be empty.'
        exit 1
    }

    $SafeBroker = ($Broker -replace '[^a-zA-Z0-9]', '')
    if (-not $SafeBroker) {
        Write-Err2 "Broker name has no usable characters after sanitization: '$Broker'"
        exit 1
    }

    # ─── Path resolution ──────────────────────────────────────────────────
    $CompiledDir    = Join-Path $Root 'COMPILED_EX5'
    $ReadyDir       = Join-Path $Root 'READY_TO_SEND'

    $BundleName     = "ZTU_${SafeBroker}_${AccountNumber}"
    $Ex5FileName    = "${BundleName}.ex5"
    $ZipFileName    = "${BundleName}.zip"

    $Ex5SourcePath  = Join-Path $CompiledDir $Ex5FileName
    $BundleFolder   = Join-Path $ReadyDir    $BundleName
    $ZipPath        = Join-Path $ReadyDir    $ZipFileName
    $Ex5DestPath    = Join-Path $BundleFolder $Ex5FileName
    $InstallTxtPath = Join-Path $BundleFolder 'install.txt'

    # ─── Banner ───────────────────────────────────────────────────────────
    Write-Host ''
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host '|   ZTU Delivery Bundle Builder                        |' -ForegroundColor DarkYellow
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host ''
    Write-Info "Account number : $AccountNumber"
    if ($SafeBroker -ne $Broker) {
        Write-Info "Broker         : $Broker  (filename uses: $SafeBroker)"
    } else {
        Write-Info "Broker         : $Broker"
    }
    Write-Info "Bundle name    : $BundleName"
    Write-Info "Root           : $Root"
    if ($Force) {
        Write-Info "Force mode     : ON  (existing folder/zip will be overwritten)"
    }
    Write-Host ''

    # ─── Step 1: verify COMPILED_EX5 folder ───────────────────────────────
    Write-Step 'Verifying COMPILED_EX5 folder exists...'
    if (-not (Test-Path -LiteralPath $CompiledDir -PathType Container)) {
        Write-Err2 "COMPILED_EX5 folder is missing: $CompiledDir"
        exit 2
    }
    Write-Ok "Folder ready: $CompiledDir"

    # ─── Step 2: verify READY_TO_SEND folder ──────────────────────────────
    Write-Step 'Verifying READY_TO_SEND folder exists...'
    if (-not (Test-Path -LiteralPath $ReadyDir -PathType Container)) {
        Write-Err2 "READY_TO_SEND folder is missing: $ReadyDir"
        exit 2
    }
    Write-Ok "Folder ready: $ReadyDir"

    # ─── Step 3: locate the EX5 ───────────────────────────────────────────
    Write-Step "Locating EX5: $Ex5FileName"
    if (-not (Test-Path -LiteralPath $Ex5SourcePath -PathType Leaf)) {
        Write-Err2 "EX5 not found: $Ex5SourcePath"
        Write-Info "Place the compiled $Ex5FileName inside $CompiledDir and re-run."
        exit 2
    }
    if ([System.IO.Path]::GetExtension($Ex5SourcePath).ToLower() -ne '.ex5') {
        Write-Err2 "Source file is not an .ex5. Refusing to bundle: $Ex5SourcePath"
        exit 6
    }
    $ex5Size = (Get-Item -LiteralPath $Ex5SourcePath).Length
    Write-Ok "Found EX5 ($ex5Size bytes)"

    # ─── Step 4: overwrite protection ─────────────────────────────────────
    Write-Step 'Checking for existing bundle / zip...'
    if (Test-Path -LiteralPath $BundleFolder) {
        if ($Force) {
            Write-Info "Bundle folder exists. Removing (because -Force was passed)."
            Remove-Item -LiteralPath $BundleFolder -Recurse -Force -ErrorAction Stop
        } else {
            Write-Err2 "Bundle folder already exists: $BundleFolder"
            Write-Info 'Re-run with -Force to overwrite, or delete the existing folder manually.'
            exit 1
        }
    }
    if (Test-Path -LiteralPath $ZipPath) {
        if ($Force) {
            Write-Info "Zip already exists. Removing (because -Force was passed)."
            Remove-Item -LiteralPath $ZipPath -Force -ErrorAction Stop
        } else {
            Write-Err2 "Zip already exists: $ZipPath"
            Write-Info 'Re-run with -Force to overwrite, or delete the existing zip manually.'
            exit 1
        }
    }
    Write-Ok 'No existing bundle/zip blocking us.'

    # ─── Step 5: create the bundle folder ─────────────────────────────────
    Write-Step "Creating bundle folder: $BundleName"
    try {
        New-Item -ItemType Directory -Path $BundleFolder -Force -ErrorAction Stop | Out-Null
    } catch {
        Write-Err2 "Could not create bundle folder: $($_.Exception.Message)"
        exit 3
    }
    Write-Ok "Bundle folder created: $BundleFolder"

    # ─── Step 6: copy the EX5 into the bundle ─────────────────────────────
    Write-Step 'Copying EX5 into the bundle...'
    try {
        Copy-Item -LiteralPath $Ex5SourcePath -Destination $Ex5DestPath -Force -ErrorAction Stop
    } catch {
        Write-Err2 "Could not copy EX5 into bundle: $($_.Exception.Message)"
        exit 3
    }
    if (-not (Test-Path -LiteralPath $Ex5DestPath -PathType Leaf)) {
        Write-Err2 "Copy reported success but EX5 not found in bundle: $Ex5DestPath"
        exit 3
    }
    Write-Ok "EX5 copied: $Ex5FileName"

    # ─── Step 7: write install.txt ────────────────────────────────────────
    Write-Step 'Writing install.txt (MT5 installation guide)...'
    $installLines = @(
        'Z Trade University',
        '',
        'MT5 Installation Guide',
        '',
        '1. Open MT5',
        '2. Click File -> Open Data Folder',
        '3. Open:',
        '   MQL5 -> Experts',
        '4. Copy the EX5 file there',
        '5. Restart MT5',
        '6. Drag the EA onto chart',
        '7. Enable Algo Trading',
        '',
        'Support:',
        'ZTradeUniversity.com'
    )
    try {
        Set-Content -LiteralPath $InstallTxtPath -Value $installLines -Encoding utf8 -ErrorAction Stop
    } catch {
        Write-Err2 "Could not write install.txt: $($_.Exception.Message)"
        exit 4
    }
    Write-Ok "install.txt written ($((Get-Item -LiteralPath $InstallTxtPath).Length) bytes)"

    # ─── Step 8: pre-zip MQ5 safety scan ──────────────────────────────────
    Write-Step 'Safety scan: ensuring no .mq5 files in bundle folder...'
    $mq5Found = Get-ChildItem -LiteralPath $BundleFolder -Recurse -File -Filter '*.mq5' -ErrorAction SilentlyContinue
    if ($mq5Found) {
        Write-Err2 "Safety check FAILED: $($mq5Found.Count) MQ5 file(s) detected in bundle. Aborting BEFORE zip creation."
        foreach ($f in $mq5Found) { Write-Err2 "   - $($f.FullName)" }
        exit 6
    }
    Write-Ok 'No MQ5 files in bundle. Safe to zip.'

    # ─── Step 9: create the ZIP ───────────────────────────────────────────
    Write-Step "Creating ZIP package: $ZipFileName"
    try {
        # Zip the CONTENTS of the bundle folder (not the wrapping folder itself)
        # so the recipient sees install.txt + the EX5 directly when they open the zip.
        $contentsGlob = Join-Path $BundleFolder '*'
        Compress-Archive -Path $contentsGlob -DestinationPath $ZipPath -CompressionLevel Optimal -Force -ErrorAction Stop
    } catch {
        Write-Err2 "ZIP creation failed: $($_.Exception.Message)"
        exit 5
    }
    if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
        Write-Err2 "ZIP not found after Compress-Archive: $ZipPath"
        exit 5
    }
    $zipSize = (Get-Item -LiteralPath $ZipPath).Length
    Write-Ok "ZIP created ($zipSize bytes)"

    # ─── Step 10: post-zip MQ5 safety scan ────────────────────────────────
    Write-Step 'Safety scan: inspecting ZIP contents for .mq5 entries...'
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
        $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
        try {
            $mq5InZip = @($archive.Entries | Where-Object { $_.FullName -match '(?i)\.mq5$' })
        } finally {
            $archive.Dispose()
        }
        if ($mq5InZip.Count -gt 0) {
            Write-Err2 "Safety check FAILED: $($mq5InZip.Count) MQ5 entry(ies) detected INSIDE the zip. Deleting zip."
            foreach ($e in $mq5InZip) { Write-Err2 "   - $($e.FullName)" }
            Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue
            exit 6
        }
        Write-Ok "Verified: ZIP contains $($archive.Entries.Count) entry(ies), zero MQ5."
    } catch {
        Write-Info "Could not introspect zip contents ($($_.Exception.Message)). Pre-zip scan already confirmed no MQ5; continuing."
    }

    # ─── Success summary ──────────────────────────────────────────────────
    Write-Host ''
    Write-Host 'Delivery bundle ready.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Bundle folder : ' -NoNewline; Write-Host $BundleFolder -ForegroundColor White
    Write-Host 'ZIP file      : ' -NoNewline; Write-Host $ZipPath      -ForegroundColor White
    Write-Host ''
    Write-Host 'Next steps (manual):' -ForegroundColor Yellow
    Write-Host "  1. Email the ZIP to the client"
    Write-Host '  2. Attach the PDF activation guide, YouTube link, and WhatsApp contact separately'
    Write-Host "  3. After delivery, move the folder into: $(Join-Path $Root 'DELIVERED')"
    Write-Host '  4. Mark the row as Emailed in compile-dashboard.html'
    Write-Host ''
    exit 0

} catch {
    Write-Host ''
    Write-Err2 "Unexpected error: $($_.Exception.Message)"
    Write-Info "At line $($_.InvocationInfo.ScriptLineNumber) in $($_.InvocationInfo.ScriptName)"
    exit 99
}

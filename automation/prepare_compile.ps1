<#
.SYNOPSIS
    ZTU compile workspace preparation helper.

.DESCRIPTION
    Prepares a per-client MQ5 file inside D:\ZTU_AUTOMATION\COMPILE_WORK
    for manual compilation in MetaEditor.

    What it does:
      1. Copies D:\ZTU_AUTOMATION\SOURCE_MQ5\ZTU_EA.mq5 into COMPILE_WORK
      2. Renames it to  ZTU_{Broker}_{AccountNumber}.mq5
      3. Generates the expected EX5 output filename
      4. Writes a build_info.txt sidecar describing the job
      5. Prints next-step manual instructions

    What it does NOT do (intentionally):
      * No MetaEditor automation
      * No EX5 compilation
      * No email sending
      * No Supabase / cloud calls
      * No browser logic

    This is purely a workspace-preparation utility. Compilation remains
    manual in MetaEditor (F7) until the future VPS automation is wired up.

.PARAMETER AccountNumber
    The MT5 account number (digits only). If omitted, you'll be prompted.

.PARAMETER Broker
    The broker name, e.g. "Exness", "HFM", "Pepperstone", "IC Markets".
    Non-alphanumeric characters are stripped during filename generation
    (so "IC Markets" becomes "ICMarkets" in the filename).
    If omitted, you'll be prompted.

.PARAMETER Root
    Root folder of the ZTU automation tree.
    Defaults to D:\ZTU_AUTOMATION.

.EXAMPLE
    .\prepare_compile.ps1 -AccountNumber 168095416 -Broker Exness

.EXAMPLE
    .\prepare_compile.ps1
    (Interactive — prompts for account number and broker)

.EXAMPLE
    .\prepare_compile.ps1 168095416 Exness
    (Positional args)

.NOTES
    Exit codes:
       0  success
       1  invalid input
       2  required folder or source MQ5 missing
       3  copy failed
       4  build_info.txt write failed
      99  unexpected error
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false, Position = 0)]
    [string]$AccountNumber,

    [Parameter(Mandatory = $false, Position = 1)]
    [string]$Broker,

    [Parameter(Mandatory = $false)]
    [string]$Root = 'D:\ZTU_AUTOMATION'
)

$ErrorActionPreference = 'Stop'

# ─── Output helpers ────────────────────────────────────────────────────────
function Write-Step([string]$msg) {
    Write-Host '[STEP] ' -ForegroundColor Cyan -NoNewline
    Write-Host $msg
}
function Write-Ok([string]$msg) {
    Write-Host '  OK   ' -ForegroundColor Green -NoNewline
    Write-Host $msg
}
function Write-Warn2([string]$msg) {
    Write-Host '  WARN ' -ForegroundColor Yellow -NoNewline
    Write-Host $msg -ForegroundColor Yellow
}
function Write-Fail([string]$msg) {
    Write-Host ' FAIL  ' -ForegroundColor Red -NoNewline
    Write-Host $msg -ForegroundColor Red
}
function Write-Info([string]$msg) {
    Write-Host '   i   ' -ForegroundColor DarkGray -NoNewline
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

    # ─── Validate ─────────────────────────────────────────────────────────
    $AccountNumber = $AccountNumber.Trim()
    $Broker        = $Broker.Trim()

    if ([string]::IsNullOrWhiteSpace($AccountNumber)) {
        Write-Fail 'Account number cannot be empty.'
        exit 1
    }
    if ($AccountNumber -notmatch '^[0-9]+$') {
        Write-Fail "Account number must contain digits only. Got: '$AccountNumber'"
        exit 1
    }
    if ([string]::IsNullOrWhiteSpace($Broker)) {
        Write-Fail 'Broker name cannot be empty.'
        exit 1
    }

    # Sanitize broker (strip non-alphanumeric, preserve case)
    $SafeBroker = ($Broker -replace '[^a-zA-Z0-9]', '')
    if (-not $SafeBroker) {
        Write-Fail "Broker name has no usable characters after sanitization: '$Broker'"
        exit 1
    }

    # ─── Path resolution ──────────────────────────────────────────────────
    $SourceDir = Join-Path $Root 'SOURCE_MQ5'
    $WorkDir   = Join-Path $Root 'COMPILE_WORK'
    $SourceMQ5 = Join-Path $SourceDir 'ZTU_EA.mq5'

    $NewMQ5Name = "ZTU_${SafeBroker}_${AccountNumber}.mq5"
    $NewEX5Name = "ZTU_${SafeBroker}_${AccountNumber}.ex5"
    $NewMQ5Path = Join-Path $WorkDir $NewMQ5Name
    $BuildInfo  = Join-Path $WorkDir 'build_info.txt'

    # ─── Banner ───────────────────────────────────────────────────────────
    Write-Host ''
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host '|   ZTU Compile Workspace Preparation                  |' -ForegroundColor DarkYellow
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host ''
    Write-Info "Account number : $AccountNumber"
    if ($SafeBroker -ne $Broker) {
        Write-Info "Broker         : $Broker  (filename uses: $SafeBroker)"
    } else {
        Write-Info "Broker         : $Broker"
    }
    Write-Info "Root           : $Root"
    Write-Host ''

    # ─── Step 1: verify source MQ5 ───────────────────────────────────────
    Write-Step 'Verifying source MQ5 file...'
    if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
        Write-Fail "Source folder does not exist: $SourceDir"
        exit 2
    }
    if (-not (Test-Path -LiteralPath $SourceMQ5 -PathType Leaf)) {
        Write-Fail "Source MQ5 missing: $SourceMQ5"
        Write-Info "Place your master ZTU_EA.mq5 inside '$SourceDir' and re-run."
        exit 2
    }
    $srcSize = (Get-Item -LiteralPath $SourceMQ5).Length
    Write-Ok "Found: $SourceMQ5 ($srcSize bytes)"

    # ─── Step 2: verify COMPILE_WORK folder ──────────────────────────────
    Write-Step 'Verifying COMPILE_WORK folder...'
    if (-not (Test-Path -LiteralPath $WorkDir -PathType Container)) {
        Write-Fail "COMPILE_WORK folder is missing: $WorkDir"
        Write-Info "Create the folder manually then re-run the script."
        exit 2
    }
    Write-Ok "Work directory ready: $WorkDir"

    # ─── Step 3: pre-flight overwrite check ──────────────────────────────
    if (Test-Path -LiteralPath $NewMQ5Path -PathType Leaf) {
        Write-Warn2 "$NewMQ5Name already exists in COMPILE_WORK. It will be overwritten."
    }
    if (Test-Path -LiteralPath $BuildInfo -PathType Leaf) {
        Write-Warn2 'build_info.txt already exists. It will be overwritten.'
    }

    # ─── Step 4: copy + rename MQ5 ───────────────────────────────────────
    Write-Step 'Copying source MQ5 to COMPILE_WORK...'
    try {
        Copy-Item -LiteralPath $SourceMQ5 -Destination $NewMQ5Path -Force -ErrorAction Stop
    } catch {
        Write-Fail "Could not copy MQ5: $($_.Exception.Message)"
        exit 3
    }
    if (-not (Test-Path -LiteralPath $NewMQ5Path -PathType Leaf)) {
        Write-Fail "Copy reported success but destination file is missing: $NewMQ5Path"
        exit 3
    }
    Write-Ok "Copied + renamed -> $NewMQ5Name"

    # ─── Step 5: write build_info.txt ────────────────────────────────────
    Write-Step 'Writing build_info.txt...'
    try {
        $infoLines = @(
            "ACCOUNT_NUMBER=$AccountNumber",
            "BROKER=$Broker",
            "BROKER_SAFE=$SafeBroker",
            "MQ5_FILE=$NewMQ5Name",
            "EXPECTED_EX5=$NewEX5Name",
            "PREPARED_AT=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
            "PREPARED_BY=$env:USERNAME",
            "HOST=$env:COMPUTERNAME"
        )
        Set-Content -LiteralPath $BuildInfo -Value $infoLines -Encoding utf8 -ErrorAction Stop
    } catch {
        Write-Fail "Could not write build_info.txt: $($_.Exception.Message)"
        exit 4
    }
    Write-Ok "Wrote: $BuildInfo"

    # ─── Success summary ─────────────────────────────────────────────────
    Write-Host ''
    Write-Host 'Compile workspace prepared successfully.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Next steps (manual, in MetaEditor):' -ForegroundColor Yellow
    Write-Host "  1. Open MetaEditor and load: " -NoNewline; Write-Host $NewMQ5Path -ForegroundColor White
    Write-Host '  2. Inject the account-number constant inside the MQ5 if your template needs it.'
    Write-Host '  3. Compile with F7. The output should be named:'
    Write-Host "       $NewEX5Name" -ForegroundColor White
    Write-Host "  4. Move the compiled EX5 into: $(Join-Path $Root 'COMPILED_EX5')"
    Write-Host "  5. Stage the delivery bundle in:  $(Join-Path $Root 'READY_TO_SEND')"
    Write-Host "  6. After emailing the client, move the folder into: $(Join-Path $Root 'DELIVERED')"
    Write-Host ''
    exit 0

} catch {
    # Catch-all for anything we did not anticipate (permission errors, etc.)
    Write-Host ''
    Write-Fail "Unexpected error: $($_.Exception.Message)"
    Write-Info "At line $($_.InvocationInfo.ScriptLineNumber) in $($_.InvocationInfo.ScriptName)"
    exit 99
}

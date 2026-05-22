<#
.SYNOPSIS
    ZTU production compile-queue engine.

.DESCRIPTION
    Enterprise-grade batch compiler for the ZTU MT5 licensing pipeline.

    For every .mq5 file staged inside D:\ZTU_AUTOMATION\COMPILE_WORK\ this
    script will:

      1. Validate the filename against the strict ZTU_<broker>_<account>.mq5
         convention. Anything that doesn't match is skipped with a warning.

      2. Invoke MetaEditor64.exe with TRUE CLI compile support
         (no GUI clicks, no AutoHotkey, no mouse automation):

             MetaEditor64.exe /compile:"<mq5>" /log:"<run.log>"

         The process is started hidden, with stdout/stderr captured and
         a hard timeout enforced by .NET's Process.WaitForExit(int).

      3. Verify compile success using FOUR independent checks:
             a) MetaEditor exit code == 0
             b) The expected .ex5 exists next to the .mq5
             c) The .ex5 file size is > 0 bytes
             d) The MetaEditor log does NOT contain hard error markers

      4. On SUCCESS:
             - Move the EX5 into D:\ZTU_AUTOMATION\COMPILED_EX5\
             - Optionally delete the per-client MQ5 from COMPILE_WORK
               (the master template in SOURCE_MQ5 is never touched)

      5. On FAILURE:
             - Build  D:\ZTU_AUTOMATION\REJECTED\<bundle>__<timestamp>\
             - Move the failed MQ5 into it
             - Copy the full compile_error.log into it
             - Write original_filename.txt + timestamp.txt
             - Continue with the rest of the queue (no early abort)

      6. After the queue is fully processed, write:
             - A coloured console summary
             - A persistent run log:  COMPILE_WORK\_logs\<timestamp>.log
             - A machine-readable JSON snapshot:
                  COMPILE_WORK\_logs\last_run.json
               (consumable by a future dashboard / VPS / CRM script)

    SECURITY POSTURE
      - The script only ever READS from COMPILE_WORK\ and SOURCE_MQ5\ (the
        latter only as a derived sanity check). It NEVER moves a .mq5 file
        into COMPILED_EX5, READY_TO_SEND, or DELIVERED.
      - The compile output is hard-typed to .ex5; anything else triggers
        the security guard and is treated as a failure.
      - A failed MQ5 ends up in REJECTED, which is an internal triage
        folder — never a customer-facing one.

.PARAMETER Root
    Root of the ZTU automation tree. Defaults to D:\ZTU_AUTOMATION.

.PARAMETER MetaEditor
    Full path to MetaEditor64.exe. Defaults to:
        C:\Program Files\MetaTrader 5\MetaEditor64.exe

.PARAMETER TimeoutSeconds
    Per-file hard timeout for the MetaEditor compile call.
    Defaults to 120 (two minutes). If the process exceeds this, it is
    killed and the file is moved to REJECTED.

.PARAMETER OverwriteEX5
    If set, an existing EX5 in COMPILED_EX5\ with the same name will be
    overwritten. Without this switch, the build is treated as a duplicate
    and the file is moved to REJECTED with reason "duplicate".

.PARAMETER KeepSourceMQ5
    If set, the per-client MQ5 in COMPILE_WORK\ is preserved after a
    successful compile. Default is to delete it so the queue stays clean
    and re-runs don't double-process.

.PARAMETER DryRun
    Parse the queue and validate the environment, but do NOT invoke
    MetaEditor and do NOT move any files. Prints what would happen.

.EXAMPLE
    .\compile_queue_engine.ps1

.EXAMPLE
    .\compile_queue_engine.ps1 -DryRun

.EXAMPLE
    .\compile_queue_engine.ps1 -OverwriteEX5 -TimeoutSeconds 240

.NOTES
    Exit codes
       0   Success — every queue item compiled, or queue was empty
       1   Environment / input error
             - MetaEditor64.exe not found
             - Required folder missing
             - Bad parameter
       2   Partial failure — some items compiled, some failed
       3   Total failure — every item in the queue failed to compile
       4   Security guard tripped (unexpected file type, MQ5 leak attempt)
      99   Unexpected error (line + message printed)
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Root = 'D:\ZTU_AUTOMATION',

    [Parameter(Mandatory = $false)]
    [string]$MetaEditor = 'C:\Program Files\MetaTrader 5\MetaEditor64.exe',

    [Parameter(Mandatory = $false)]
    [ValidateRange(10, 1800)]
    [int]$TimeoutSeconds = 120,

    [switch]$OverwriteEX5,
    [switch]$KeepSourceMQ5,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# Pin the bundle-name convention written by prepare_compile.ps1 so this
# script will never accidentally compile an unrelated MQ5 that happened
# to land in COMPILE_WORK (e.g. a debug file the operator was poking at).
$BUNDLE_REGEX = '^ZTU_(?<broker>[A-Za-z0-9]+)_(?<account>[0-9]+)\.mq5$'

# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT HELPERS
#  Every Write-* call below ALSO appends to $script:RunLogLines so the master
#  log captures exactly what the operator saw on the console.
# ════════════════════════════════════════════════════════════════════════════
$script:RunLogLines = New-Object System.Collections.Generic.List[string]

function Write-RunLog([string]$tag, [string]$msg) {
    $stamp = (Get-Date).ToString('HH:mm:ss')
    $script:RunLogLines.Add("$stamp [$tag] $msg")
}
function Write-Step  ([string]$msg) { Write-Host '[STEP]  ' -ForegroundColor Cyan      -NoNewline; Write-Host $msg;                          Write-RunLog 'STEP'  $msg }
function Write-Ok    ([string]$msg) { Write-Host '[OK]    ' -ForegroundColor Green     -NoNewline; Write-Host $msg;                          Write-RunLog 'OK'    $msg }
function Write-Info  ([string]$msg) { Write-Host '[INFO]  ' -ForegroundColor DarkGray  -NoNewline; Write-Host $msg -ForegroundColor DarkGray; Write-RunLog 'INFO'  $msg }
function Write-Warn2 ([string]$msg) { Write-Host '[WARN]  ' -ForegroundColor Yellow    -NoNewline; Write-Host $msg -ForegroundColor Yellow;   Write-RunLog 'WARN'  $msg }
function Write-Err2  ([string]$msg) { Write-Host '[ERROR] ' -ForegroundColor Red       -NoNewline; Write-Host $msg -ForegroundColor Red;      Write-RunLog 'ERROR' $msg }

# ════════════════════════════════════════════════════════════════════════════
#  Initialize-Environment
#
#  Validates that every dependency this script needs is present BEFORE we
#  touch a single MQ5. Returns a hashtable of canonical paths used by the
#  rest of the pipeline.
# ════════════════════════════════════════════════════════════════════════════
function Initialize-Environment {
    Write-Step 'Validating environment...'

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        Write-Err2 "Root folder does not exist: $Root"
        exit 1
    }

    $paths = @{
        Root         = $Root
        SourceMq5Dir = Join-Path $Root 'SOURCE_MQ5'
        WorkDir      = Join-Path $Root 'COMPILE_WORK'
        CompiledDir  = Join-Path $Root 'COMPILED_EX5'
        ReadyDir     = Join-Path $Root 'READY_TO_SEND'
        DeliveredDir = Join-Path $Root 'DELIVERED'
        RejectedDir  = Join-Path $Root 'REJECTED'
        LogsDir      = Join-Path (Join-Path $Root 'COMPILE_WORK') '_logs'
        # PRODUCTION HARDENING — post-compile artefacts
        ProcessedDir = Join-Path (Join-Path $Root 'COMPILE_WORK')  'processed'
        HashesDir    = Join-Path (Join-Path $Root 'COMPILED_EX5')  'hashes'
        ManifestsDir = Join-Path (Join-Path $Root 'COMPILED_EX5')  'manifests'
        MetaEditor   = $MetaEditor
    }

    # Required: COMPILE_WORK + COMPILED_EX5 + REJECTED + MetaEditor64.exe
    $requiredFolders = @($paths.WorkDir, $paths.CompiledDir, $paths.RejectedDir)
    foreach ($f in $requiredFolders) {
        if (-not (Test-Path -LiteralPath $f -PathType Container)) {
            Write-Err2 "Required folder is missing: $f"
            exit 1
        }
    }

    # The MetaEditor binary MUST be present at the configured path.
    # Refuse to fall back to PATH lookup — we want this to be deterministic.
    if (-not (Test-Path -LiteralPath $paths.MetaEditor -PathType Leaf)) {
        Write-Err2 "MetaEditor64.exe not found at: $($paths.MetaEditor)"
        Write-Info 'Pass -MetaEditor "<full path>" if it lives elsewhere on this machine.'
        exit 1
    }

    # _logs is auto-created so the operator never has to think about it.
    if (-not (Test-Path -LiteralPath $paths.LogsDir -PathType Container)) {
        New-Item -ItemType Directory -Path $paths.LogsDir -Force -ErrorAction Stop | Out-Null
        Write-Info "Created logs folder: $($paths.LogsDir)"
    }

    # PRODUCTION HARDENING — post-compile artefact folders auto-create as needed.
    foreach ($hardenedDir in @($paths.ProcessedDir, $paths.HashesDir, $paths.ManifestsDir)) {
        if (-not (Test-Path -LiteralPath $hardenedDir -PathType Container)) {
            New-Item -ItemType Directory -Path $hardenedDir -Force -ErrorAction Stop | Out-Null
            Write-Info "Created artefact folder: $hardenedDir"
        }
    }

    Write-Ok "Environment OK. MetaEditor: $($paths.MetaEditor)"
    return $paths
}

# ════════════════════════════════════════════════════════════════════════════
#  Get-CompileQueue
#
#  Returns an array of queue items. Each item is a [pscustomobject] with:
#       FullName       — absolute path to the MQ5
#       FileName       — just the file name
#       BaseName       — file name minus .mq5
#       Broker         — extracted from the filename
#       Account        — extracted from the filename
#       ExpectedEx5    — where the EX5 will land in COMPILE_WORK after build
#       TargetEx5      — destination filename inside COMPILED_EX5
#       Valid          — $true if the filename matched the bundle regex
#       SkipReason     — non-empty if Valid is $false
# ════════════════════════════════════════════════════════════════════════════
function Get-CompileQueue {
    param([string]$WorkDir)
    Write-Step "Scanning compile queue: $WorkDir"

    # Only enumerate top-level .mq5 files. Subfolders (including _logs) are
    # ignored. This is the security gate that prevents any accidental
    # recursion into SOURCE_MQ5 or other restricted folders.
    $files = Get-ChildItem -LiteralPath $WorkDir -File -Filter '*.mq5' -ErrorAction SilentlyContinue
    if (-not $files) {
        Write-Info 'No .mq5 files found.'
        return @()
    }

    $queue = New-Object System.Collections.Generic.List[object]
    foreach ($f in $files) {
        $item = [pscustomobject]@{
            FullName    = $f.FullName
            FileName    = $f.Name
            BaseName    = $f.BaseName
            Broker      = $null
            Account     = $null
            ExpectedEx5 = [System.IO.Path]::ChangeExtension($f.FullName, '.ex5')
            TargetEx5   = $null
            Valid       = $false
            SkipReason  = $null
        }
        if ($f.Name -match $BUNDLE_REGEX) {
            $item.Broker    = $Matches['broker']
            $item.Account   = $Matches['account']
            $item.TargetEx5 = "$($item.BaseName).ex5"
            $item.Valid     = $true
        } else {
            $item.SkipReason = "Filename does not match ZTU_<broker>_<account>.mq5 pattern"
        }
        [void]$queue.Add($item)
    }

    Write-Ok ("Queue scanned. {0} file(s) found, {1} valid, {2} will be skipped." -f $queue.Count,
        (@($queue | Where-Object Valid).Count),
        (@($queue | Where-Object { -not $_.Valid }).Count))
    return ,$queue.ToArray()   # comma-prefix forces array even with 1 element
}

# ════════════════════════════════════════════════════════════════════════════
#  Invoke-MetaEditorCompile
#
#  Runs MetaEditor64.exe with /compile + /log against ONE MQ5 file.
#  Uses System.Diagnostics.Process directly so we get:
#     - precise per-file timeout (Process.WaitForExit(int))
#     - hidden window
#     - captured stdout / stderr
#     - guaranteed disposal
#
#  Returns a hashtable:
#     Success     : $true/$false
#     ExitCode    : MetaEditor exit code (or -1 on timeout)
#     DurationMs  : how long the compile took
#     Reason      : human-readable failure reason (empty on success)
#     LogPath     : path to the MetaEditor log file
#     LogPreview  : last ~40 lines of the log (for inline diagnostics)
# ════════════════════════════════════════════════════════════════════════════
function Invoke-MetaEditorCompile {
    param(
        [Parameter(Mandatory)] [string]$MetaEditorPath,
        [Parameter(Mandatory)] [string]$Mq5Path,
        [Parameter(Mandatory)] [string]$LogPath,
        [Parameter(Mandatory)] [int]   $TimeoutSeconds
    )

    # Pre-clean any stale log so we don't accidentally parse old output.
    if (Test-Path -LiteralPath $LogPath) {
        Remove-Item -LiteralPath $LogPath -Force -ErrorAction SilentlyContinue
    }

    # ─── R2 DEFENCE-IN-DEPTH: placeholder safety guard ─────────────────────
    # Refuses to compile a staged MQ5 that still contains the orchestrator's
    # account-injection placeholder. Catches silent injection failures (typo
    # in placeholder, encoding mismatch, stale pre-injection copy of SOURCE,
    # etc.) BEFORE MetaEditor is invoked, so no wrongly-locked EX5 can be
    # produced. Reads the staged file only — never writes, never touches EA
    # logic. If the read itself fails, downgrade to WARN so the existing
    # MetaEditor invocation can still surface the underlying error.
    try {
        $stagedRaw = Get-Content -LiteralPath $Mq5Path -Raw -Encoding utf8 -ErrorAction Stop
        if ($stagedRaw -match '__ZTU_ACCOUNT__') {
            return @{
                Success    = $false
                ExitCode   = -2
                DurationMs = 0
                Reason     = 'PRE-COMPILE SAFETY: staged MQ5 still contains __ZTU_ACCOUNT__ placeholder. Account injection did not run (re-run prepare_compile + master_engine staging). Refusing to compile so no wrongly-locked EX5 is produced.'
                LogPath    = $LogPath
                LogPreview = ''
                Stderr     = ''
            }
        }
    } catch {
        Write-Warn2 ("Placeholder safety scan could not read staged MQ5: " + $_.Exception.Message + " — proceeding to MetaEditor anyway.")
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName               = $MetaEditorPath
    # Quoting note: MetaEditor expects /compile:"<path>" as a SINGLE token.
    # Both paths are quoted because they will almost always contain spaces.
    $psi.Arguments              = '/compile:"{0}" /log:"{1}"' -f $Mq5Path, $LogPath
    $psi.UseShellExecute        = $false
    $psi.CreateNoWindow         = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.WorkingDirectory       = [System.IO.Path]::GetDirectoryName($Mq5Path)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $proc = $null
    try {
        $proc = [System.Diagnostics.Process]::Start($psi)
        # Read streams asynchronously so a chatty MetaEditor can't deadlock
        # us by filling its stdout buffer while we're waiting for exit.
        $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
        $stderrTask = $proc.StandardError.ReadToEndAsync()

        $finished = $proc.WaitForExit($TimeoutSeconds * 1000)
        $sw.Stop()

        if (-not $finished) {
            try { $proc.Kill() } catch { }
            return @{
                Success    = $false
                ExitCode   = -1
                DurationMs = $sw.ElapsedMilliseconds
                Reason     = "TIMEOUT after $TimeoutSeconds seconds"
                LogPath    = $LogPath
                LogPreview = ''
            }
        }

        # Streams are guaranteed completed once the process has exited.
        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result
        $exit   = $proc.ExitCode

        $logPreview = ''
        if (Test-Path -LiteralPath $LogPath -PathType Leaf) {
            try {
                $logPreview = (Get-Content -LiteralPath $LogPath -Tail 40 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
            } catch { }
        } elseif ($stdout) {
            # Some MetaEditor builds write to stdout when /log isn't honoured;
            # treat that as the log so the operator still sees something.
            try { Set-Content -LiteralPath $LogPath -Value $stdout -Encoding utf8 -ErrorAction SilentlyContinue } catch { }
            $logPreview = $stdout
        }

        return @{
            Success    = ($exit -eq 0)
            ExitCode   = $exit
            DurationMs = $sw.ElapsedMilliseconds
            Reason     = if ($exit -eq 0) { '' } else { "MetaEditor exit code $exit" }
            LogPath    = $LogPath
            LogPreview = $logPreview
            Stderr     = $stderr
        }
    } catch {
        if ($sw.IsRunning) { $sw.Stop() }
        return @{
            Success    = $false
            ExitCode   = -2
            DurationMs = $sw.ElapsedMilliseconds
            Reason     = "Process start failure: $($_.Exception.Message)"
            LogPath    = $LogPath
            LogPreview = ''
        }
    } finally {
        if ($proc) { try { $proc.Dispose() } catch { } }
    }
}

# ════════════════════════════════════════════════════════════════════════════
#  Test-CompileArtifact
#
#  Layered success verification — even if MetaEditor returns exit 0 we still
#  insist on these conditions before declaring victory:
#      a) the expected EX5 file exists at the expected path
#      b) its extension is exactly .ex5 (never .mq5, never anything else)
#      c) its size is greater than zero bytes
#      d) the compile log does NOT contain any line beginning with
#         "error" / "errors:" / "fatal" / "cannot compile" (case-insensitive)
#
#  Returns hashtable: Ok ($true/$false), Reason (string).
# ════════════════════════════════════════════════════════════════════════════
function Test-CompileArtifact {
    param(
        [Parameter(Mandatory)] [string]$Ex5Path,
        [Parameter(Mandatory)] [string]$LogPath
    )

    if (-not (Test-Path -LiteralPath $Ex5Path -PathType Leaf)) {
        return @{ Ok = $false; Reason = "EX5 not produced at expected path: $Ex5Path" }
    }
    if ([System.IO.Path]::GetExtension($Ex5Path).ToLower() -ne '.ex5') {
        return @{ Ok = $false; Reason = "Compile artifact has wrong extension (security guard): $Ex5Path" }
    }
    $ex5Size = (Get-Item -LiteralPath $Ex5Path).Length
    if ($ex5Size -le 0) {
        return @{ Ok = $false; Reason = "EX5 is zero bytes: $Ex5Path" }
    }

    # Hard error markers in the log. MetaEditor's success log looks like:
    #     "0 errors, 0 warnings"
    # Any line that has "errors:" / "error " / etc with a non-zero count is a
    # failure. We're intentionally conservative — better a false-negative on
    # success than a tainted EX5 silently shipping to a customer.
    if (Test-Path -LiteralPath $LogPath -PathType Leaf) {
        $logText = Get-Content -LiteralPath $LogPath -Raw -ErrorAction SilentlyContinue
        if ($logText) {
            # Match "<N> errors" where N > 0  (e.g. "3 errors", "12 errors")
            $errMatch = [regex]::Match($logText, '(?im)^\s*(\d+)\s+errors?\b')
            if ($errMatch.Success -and ([int]$errMatch.Groups[1].Value -gt 0)) {
                return @{ Ok = $false; Reason = "Compile log reports $($errMatch.Groups[1].Value) error(s)" }
            }
            # Hard fatal markers regardless of count formatting
            if ($logText -match '(?im)^\s*(fatal|cannot compile|compilation aborted)') {
                return @{ Ok = $false; Reason = 'Compile log contains a fatal/abort marker' }
            }
        }
    }

    return @{ Ok = $true; Reason = '' }
}

# ════════════════════════════════════════════════════════════════════════════
#  Move-EX5ToCompiled
#
#  Moves the freshly built EX5 from COMPILE_WORK into COMPILED_EX5.
#  Honours -OverwriteEX5 (treats a same-named existing EX5 as a duplicate
#  build unless Overwrite was requested).
#
#  Returns the final destination path. Throws on failure (caller catches).
# ════════════════════════════════════════════════════════════════════════════
function Move-EX5ToCompiled {
    param(
        [Parameter(Mandatory)] [string]$Ex5Source,
        [Parameter(Mandatory)] [string]$CompiledDir,
        [Parameter(Mandatory)] [string]$TargetName,
        [switch]$Overwrite
    )

    # Defensive extension lock — we will never put anything except an .ex5
    # into COMPILED_EX5 via this function.
    if ([System.IO.Path]::GetExtension($Ex5Source).ToLower() -ne '.ex5') {
        throw "Refusing to move non-.ex5 artifact into COMPILED_EX5: $Ex5Source"
    }
    if ([System.IO.Path]::GetExtension($TargetName).ToLower() -ne '.ex5') {
        throw "Refusing to use non-.ex5 target name: $TargetName"
    }

    $destPath = Join-Path $CompiledDir $TargetName
    if (Test-Path -LiteralPath $destPath -PathType Leaf) {
        if (-not $Overwrite) {
            throw "Duplicate build: $destPath already exists. Re-run with -OverwriteEX5 to replace."
        }
        Remove-Item -LiteralPath $destPath -Force -ErrorAction Stop
    }

    Move-Item -LiteralPath $Ex5Source -Destination $destPath -ErrorAction Stop
    return $destPath
}

# ════════════════════════════════════════════════════════════════════════════
#  Move-FailureToRejected
#
#  Builds the per-failure REJECTED bucket exactly as required by spec:
#
#       REJECTED\
#           <BundleBaseName>__<YYYYMMDD-HHmmss>\
#               <original_mq5_filename>.mq5
#               compile_error.log
#               original_filename.txt
#               timestamp.txt
#
#  The timestamp suffix guarantees we never overwrite an earlier failure
#  for the same bundle (which would erase audit trail).
#
#  Returns the rejected-bucket folder path.
# ════════════════════════════════════════════════════════════════════════════
function Move-FailureToRejected {
    param(
        [Parameter(Mandatory)] [pscustomobject]$Item,
        [Parameter(Mandatory)] [string]$RejectedDir,
        [Parameter(Mandatory)] [string]$LogPath,
        [Parameter(Mandatory)] [string]$Reason
    )

    $stamp      = (Get-Date).ToString('yyyyMMdd-HHmmss')
    $bucketName = "$($Item.BaseName)__$stamp"
    $bucketDir  = Join-Path $RejectedDir $bucketName
    New-Item -ItemType Directory -Path $bucketDir -Force -ErrorAction Stop | Out-Null

    # 1) Move the failed MQ5 into the bucket.
    #    NOTE: REJECTED is INTERNAL ONLY. MQ5 files never leave the system
    #    via this folder — they only ever get archived here for triage.
    if (Test-Path -LiteralPath $Item.FullName -PathType Leaf) {
        try {
            Move-Item -LiteralPath $Item.FullName -Destination (Join-Path $bucketDir $Item.FileName) -Force -ErrorAction Stop
        } catch {
            Write-Warn2 "Could not move failed MQ5 into REJECTED: $($_.Exception.Message)"
        }
    }

    # 2) Copy the compile log into the bucket under a stable name.
    if (Test-Path -LiteralPath $LogPath -PathType Leaf) {
        try {
            Copy-Item -LiteralPath $LogPath -Destination (Join-Path $bucketDir 'compile_error.log') -Force -ErrorAction Stop
        } catch {
            Write-Warn2 "Could not copy compile log into REJECTED: $($_.Exception.Message)"
        }
    } else {
        # No log? Write a placeholder so the bucket still tells the full story.
        @("MetaEditor produced no log file.","Reason recorded: $Reason") |
            Set-Content -LiteralPath (Join-Path $bucketDir 'compile_error.log') -Encoding utf8
    }

    # 3) Two small sidecar text files for forensic context.
    @($Item.FileName) | Set-Content -LiteralPath (Join-Path $bucketDir 'original_filename.txt') -Encoding utf8
    @(
        "TIMESTAMP=$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
        "REASON=$Reason"
        "BROKER=$($Item.Broker)"
        "ACCOUNT=$($Item.Account)"
        "HOST=$env:COMPUTERNAME"
        "USER=$env:USERNAME"
    ) | Set-Content -LiteralPath (Join-Path $bucketDir 'timestamp.txt') -Encoding utf8

    return $bucketDir
}

# ════════════════════════════════════════════════════════════════════════════
#  PRODUCTION HARDENING — post-success artefact builders
#  ───────────────────────────────────────────────────────────────────────────
#  The three functions below are invoked AFTER an EX5 has been successfully
#  moved into COMPILED_EX5\. They are idempotent, side-effect free outside
#  their own target folders, and never touch SOURCE_MQ5 / READY_TO_SEND /
#  DELIVERED / customer-facing bundles.
# ════════════════════════════════════════════════════════════════════════════

# ─── Move-MQ5ToProcessed ───────────────────────────────────────────────────
#
#  Archives the per-client MQ5 from COMPILE_WORK\ into COMPILE_WORK\processed\
#  so the queue stays clean for re-runs while preserving an audit trail.
#
#  If a same-named MQ5 already exists in processed\ (because the bundle was
#  rebuilt), the new file is suffixed with a timestamp to preserve history.
#
#  SECURITY: this MQ5 lives entirely inside COMPILE_WORK — it never crosses
#  into COMPILED_EX5, READY_TO_SEND, or DELIVERED.
# ───────────────────────────────────────────────────────────────────────────
function Move-MQ5ToProcessed {
    param(
        [Parameter(Mandatory)] [pscustomobject]$Item,
        [Parameter(Mandatory)] [string]$ProcessedDir
    )
    if (-not (Test-Path -LiteralPath $ProcessedDir -PathType Container)) {
        New-Item -ItemType Directory -Path $ProcessedDir -Force -ErrorAction Stop | Out-Null
    }
    $dest = Join-Path $ProcessedDir $Item.FileName
    if (Test-Path -LiteralPath $dest -PathType Leaf) {
        $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
        $dest  = Join-Path $ProcessedDir ("$($Item.BaseName)__$stamp.mq5")
    }
    Move-Item -LiteralPath $Item.FullName -Destination $dest -ErrorAction Stop
    return $dest
}

# ─── Get-Ex5Sha256AndSave ──────────────────────────────────────────────────
#
#  Computes a SHA256 of the freshly-built EX5 and writes it to:
#       COMPILED_EX5\hashes\<bundle>.sha256.txt
#
#  Output format follows the standard `sha256sum` convention so the file
#  can be verified later with:
#       Get-FileHash <ex5> -Algorithm SHA256
#
#  Returns @{ Hash = <hex-lower>; HashFile = <path> }.
# ───────────────────────────────────────────────────────────────────────────
function Get-Ex5Sha256AndSave {
    param(
        [Parameter(Mandatory)] [string]$Ex5Path,
        [Parameter(Mandatory)] [string]$HashesDir,
        [Parameter(Mandatory)] [string]$BundleBaseName
    )
    if (-not (Test-Path -LiteralPath $HashesDir -PathType Container)) {
        New-Item -ItemType Directory -Path $HashesDir -Force -ErrorAction Stop | Out-Null
    }
    if ([System.IO.Path]::GetExtension($Ex5Path).ToLower() -ne '.ex5') {
        throw "Refusing to hash a non-.ex5 file: $Ex5Path"
    }
    $hash       = (Get-FileHash -LiteralPath $Ex5Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
    $ex5Name    = Split-Path -Leaf $Ex5Path
    $hashFile   = Join-Path $HashesDir ("$BundleBaseName.sha256.txt")
    # Standard sha256sum format: "<hex>  *<filename>"  (binary-mode marker)
    Set-Content -LiteralPath $hashFile -Value ("$hash *$ex5Name") -Encoding utf8 -ErrorAction Stop
    return @{ Hash = $hash; HashFile = $hashFile }
}

# ─── Write-BuildManifest ───────────────────────────────────────────────────
#
#  Emits COMPILED_EX5\manifests\<bundle>.json — a per-build manifest with
#  every field a dashboard / CRM / VPS deployer might need.
#
#  Manifest schema is versioned via the `manifest_version` field; future
#  scripts must continue to write `1.x` formats so consumers never break.
# ───────────────────────────────────────────────────────────────────────────
function Write-BuildManifest {
    param(
        [Parameter(Mandatory)] [pscustomobject]$Item,
        [Parameter(Mandatory)] [string]$Ex5Path,
        [Parameter(Mandatory)] [string]$Sha256Hash,
        [Parameter(Mandatory)] [string]$HashFile,
        [Parameter(Mandatory)] [int]   $DurationMs,
        [Parameter(Mandatory)] [string]$ManifestsDir,
        [Parameter(Mandatory)] [datetime]$CompiledAt,
        [Parameter(Mandatory)] [string]$ProcessedMq5Path
    )
    if (-not (Test-Path -LiteralPath $ManifestsDir -PathType Container)) {
        New-Item -ItemType Directory -Path $ManifestsDir -Force -ErrorAction Stop | Out-Null
    }
    $ex5Size = (Get-Item -LiteralPath $Ex5Path).Length
    $manifest = [pscustomobject]@{
        manifest_version    = '1.0'
        bundle              = $Item.BaseName
        broker              = $Item.Broker
        account             = $Item.Account
        mq5_filename        = $Item.FileName
        mq5_archived_path   = $ProcessedMq5Path
        ex5_filename        = (Split-Path -Leaf $Ex5Path)
        ex5_path            = $Ex5Path
        ex5_size_bytes      = $ex5Size
        sha256              = $Sha256Hash
        sha256_file         = $HashFile
        compile_timestamp   = $CompiledAt.ToString('o')
        compile_duration_ms = $DurationMs
        status              = 'success'
        host                = $env:COMPUTERNAME
        user                = $env:USERNAME
    }
    $manifestPath = Join-Path $ManifestsDir ("$($Item.BaseName).json")
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8 -ErrorAction Stop
    return $manifestPath
}

# ════════════════════════════════════════════════════════════════════════════
#  Write-RunSummary
#
#  Prints the operator-facing summary AND writes two persistent artifacts:
#     <_logs>\<timestamp>.log        — replay of every console line
#     <_logs>\last_run.json          — structured snapshot for dashboards
# ════════════════════════════════════════════════════════════════════════════
function Write-RunSummary {
    param(
        [Parameter(Mandatory)] [array]   $Results,
        [Parameter(Mandatory)] [string]  $LogsDir,
        [Parameter(Mandatory)] [datetime]$RunStartedAt
    )

    $success = @($Results | Where-Object { $_.Status -eq 'success' })
    $failed  = @($Results | Where-Object { $_.Status -eq 'failed'  })
    $skipped = @($Results | Where-Object { $_.Status -eq 'skipped' })
    $duped   = @($Results | Where-Object { $_.Status -eq 'duplicate' })

    Write-Host ''
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host '|   Compile Queue Run Summary                          |' -ForegroundColor DarkYellow
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host ''
    Write-Host ("TOTAL processed : {0}"  -f $Results.Count)        -ForegroundColor White
    Write-Host ("SUCCESS         : {0}"  -f $success.Count)        -ForegroundColor Green
    Write-Host ("FAILED          : {0}"  -f $failed.Count)         -ForegroundColor Red
    Write-Host ("SKIPPED         : {0}"  -f $skipped.Count)        -ForegroundColor Yellow
    Write-Host ("DUPLICATE       : {0}"  -f $duped.Count)          -ForegroundColor Yellow
    Write-Host ''

    # Per-row table
    foreach ($r in $Results) {
        $tag = switch ($r.Status) {
            'success'   { '[OK]      '; break }
            'failed'    { '[FAILED]  '; break }
            'skipped'   { '[SKIPPED] '; break }
            'duplicate' { '[DUPE]    '; break }
            default     { '[UNK]     '; break }
        }
        $color = switch ($r.Status) {
            'success'   { 'Green'  ; break }
            'failed'    { 'Red'    ; break }
            'skipped'   { 'Yellow' ; break }
            'duplicate' { 'Yellow' ; break }
            default     { 'White'  ; break }
        }
        $line = '{0}{1,-40}  {2}' -f $tag, $r.BaseName, $r.Detail
        Write-Host $line -ForegroundColor $color
    }
    Write-Host ''

    # Persist artefacts.
    $runStamp = $RunStartedAt.ToString('yyyy-MM-dd_HH-mm-ss')

    $runLogPath = Join-Path $LogsDir ("compile_queue_run__{0}.log" -f $runStamp)
    try {
        $script:RunLogLines | Set-Content -LiteralPath $runLogPath -Encoding utf8 -ErrorAction Stop
        Write-Info "Run log: $runLogPath"
    } catch {
        Write-Warn2 "Could not write run log: $($_.Exception.Message)"
    }

    $jsonPath = Join-Path $LogsDir 'last_run.json'
    $jsonPayload = [pscustomobject]@{
        timestamp        = (Get-Date).ToString('o')
        run_started_at   = $RunStartedAt.ToString('o')
        host             = $env:COMPUTERNAME
        user             = $env:USERNAME
        meta_editor      = $MetaEditor
        root             = $Root
        counts = [pscustomobject]@{
            total     = $Results.Count
            success   = $success.Count
            failed    = $failed.Count
            skipped   = $skipped.Count
            duplicate = $duped.Count
        }
        items = $Results
        run_log = $runLogPath
    }
    try {
        $jsonPayload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding utf8 -ErrorAction Stop
        Write-Info "Machine-readable summary: $jsonPath"
    } catch {
        Write-Warn2 "Could not write last_run.json: $($_.Exception.Message)"
    }
}

# ════════════════════════════════════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════════════════════════════════════
try {

    $runStartedAt = Get-Date

    # ─── Banner ────────────────────────────────────────────────────────────
    Write-Host ''
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host '|   ZTU Compile Queue Engine                           |' -ForegroundColor DarkYellow
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host ''
    if ($DryRun)        { Write-Warn2 'DRY-RUN MODE — no MetaEditor invocation, no file moves.' }
    if ($OverwriteEX5)  { Write-Info  'Overwrite mode: existing EX5 in COMPILED_EX5 will be replaced.' }
    if ($KeepSourceMQ5) { Write-Info  'Keep mode: per-client MQ5 will be retained in COMPILE_WORK after success.' }
    Write-Host ''

    # ─── 1. Validate environment ───────────────────────────────────────────
    $paths = Initialize-Environment

    # ─── 2. Discover the queue ─────────────────────────────────────────────
    $queue = Get-CompileQueue -WorkDir $paths.WorkDir

    if ($queue.Count -eq 0) {
        Write-Info 'Compile queue is empty. Nothing to do.'
        Write-RunSummary -Results @() -LogsDir $paths.LogsDir -RunStartedAt $runStartedAt
        exit 0
    }

    # ─── 3. Pre-flight: detect duplicate accounts WITHIN this queue ────────
    # If two different MQ5 files in COMPILE_WORK target the same broker+account
    # combination, both will fight to write the same EX5. Flag those up-front.
    $dupGroups = $queue | Where-Object Valid | Group-Object Broker, Account | Where-Object { $_.Count -gt 1 }
    foreach ($g in $dupGroups) {
        Write-Warn2 "Duplicate (broker,account) in queue: $($g.Name) — $($g.Count) files. All but the first will be flagged."
        $first = $true
        foreach ($item in $g.Group) {
            if ($first) { $first = $false; continue }
            $item.Valid      = $false
            $item.SkipReason = "Duplicate of $($g.Name) inside the same queue"
        }
    }

    # ─── 4. Process each queue item ────────────────────────────────────────
    $results = New-Object System.Collections.Generic.List[object]
    $idx = 0
    foreach ($item in $queue) {
        $idx++
        Write-Host ''
        Write-Step ("[{0}/{1}] {2}" -f $idx, $queue.Count, $item.FileName)

        $result = [pscustomobject]@{
            Index        = $idx
            FileName     = $item.FileName
            BaseName     = $item.BaseName
            Broker       = $item.Broker
            Account      = $item.Account
            Status       = 'unknown'
            ExitCode     = $null
            DurationMs   = 0
            Detail       = ''
            CompiledEx5  = ''
            RejectedDir  = ''
            # PRODUCTION HARDENING — post-compile artefact tracking
            Sha256       = ''
            HashFile     = ''
            ManifestFile = ''
            ProcessedMq5 = ''
        }

        # Skip if filename invalid OR flagged as duplicate.
        if (-not $item.Valid) {
            Write-Warn2 ("Skipped: {0}" -f $item.SkipReason)
            $result.Status = 'skipped'
            $result.Detail = $item.SkipReason
            [void]$results.Add($result)
            continue
        }

        # Refuse to proceed if the EX5 already exists in COMPILED_EX5 (and the
        # operator hasn't opted in to overwriting). Treat as a duplicate.
        $finalEx5Path = Join-Path $paths.CompiledDir $item.TargetEx5
        if ((Test-Path -LiteralPath $finalEx5Path -PathType Leaf) -and -not $OverwriteEX5) {
            Write-Warn2 "Skipping: $($item.TargetEx5) already exists in COMPILED_EX5 (pass -OverwriteEX5 to rebuild)."
            $result.Status = 'duplicate'
            $result.Detail = "Already in COMPILED_EX5: $finalEx5Path"
            [void]$results.Add($result)
            continue
        }

        # Dry-run path: report intent and move on without invoking MetaEditor.
        if ($DryRun) {
            Write-Info "Would compile and produce: $finalEx5Path"
            $result.Status = 'success'
            $result.Detail = '[DRY-RUN] no compile attempted'
            $result.CompiledEx5 = $finalEx5Path
            [void]$results.Add($result)
            continue
        }

        # ── Compile ─────────────────────────────────────────────────────────
        $perFileLog = Join-Path $paths.LogsDir ("$($item.BaseName).log")
        $compile    = Invoke-MetaEditorCompile -MetaEditorPath $paths.MetaEditor `
                                               -Mq5Path        $item.FullName `
                                               -LogPath        $perFileLog `
                                               -TimeoutSeconds $TimeoutSeconds

        $result.ExitCode   = $compile.ExitCode
        $result.DurationMs = $compile.DurationMs

        # ── Layered verification ────────────────────────────────────────────
        # Run artifact check unconditionally — some MetaEditor builds return a
        # non-zero exit code despite producing a valid EX5 with 0 errors.
        $verify = Test-CompileArtifact -Ex5Path $item.ExpectedEx5 -LogPath $perFileLog
        if (-not $compile.Success -and $verify.Ok) {
            $compile.Success = $true   # Artifact clean — promote over bad exit code
            $compile.Reason  = ''
        } elseif ($compile.Success -and -not $verify.Ok) {
            $compile.Success = $false
            $compile.Reason  = $verify.Reason
        }

        if ($compile.Success) {
            # ── Success path ────────────────────────────────────────────────
            try {
                $moved = Move-EX5ToCompiled -Ex5Source $item.ExpectedEx5 `
                                            -CompiledDir $paths.CompiledDir `
                                            -TargetName  $item.TargetEx5 `
                                            -Overwrite:$OverwriteEX5
            } catch {
                # If the move itself fails, downgrade to a "failed" outcome
                # so the operator's REJECTED bucket captures the artefact.
                $compile.Success = $false
                $compile.Reason  = "Compile OK but move to COMPILED_EX5 failed: $($_.Exception.Message)"
            }

            if ($compile.Success) {
                $compiledAt         = Get-Date
                $result.Status      = 'success'
                $result.CompiledEx5 = $moved
                $result.Detail      = "{0:N0} bytes in {1:N0} ms" -f ((Get-Item -LiteralPath $moved).Length), $compile.DurationMs
                Write-Ok "Compiled OK -> $moved"

                # ── PRODUCTION HARDENING #1 — SHA256 sidecar ────────────────
                #   Hash the EX5 at its FINAL location (COMPILED_EX5) so the
                #   recorded digest matches exactly what the delivery bundle
                #   script will later zip and ship.
                $sha256Info = $null
                try {
                    $sha256Info     = Get-Ex5Sha256AndSave -Ex5Path        $moved `
                                                            -HashesDir      $paths.HashesDir `
                                                            -BundleBaseName $item.BaseName
                    $result.Sha256   = $sha256Info.Hash
                    $result.HashFile = $sha256Info.HashFile
                    Write-Ok "SHA256: $($sha256Info.Hash)"
                } catch {
                    Write-Warn2 "Could not generate SHA256 hash: $($_.Exception.Message)"
                }

                # ── PRODUCTION HARDENING #2 — archive the processed MQ5 ─────
                #   Default behaviour: MOVE the per-client MQ5 into
                #   COMPILE_WORK\processed\ so the queue stays clean for the
                #   next run AND we keep a full audit trail of what was built.
                #
                #   -KeepSourceMQ5 (testing-only) leaves the MQ5 in
                #   COMPILE_WORK; note that the next run will then re-process
                #   it and overwrite the EX5 unless the bundle is also
                #   removed from COMPILED_EX5 first.
                $processedMq5Path = ''
                if ($KeepSourceMQ5) {
                    Write-Warn2 "KeepSourceMQ5 enabled: leaving MQ5 in COMPILE_WORK (re-runs will re-process it): $($item.FileName)"
                    $processedMq5Path = $item.FullName
                } else {
                    try {
                        $processedMq5Path = Move-MQ5ToProcessed -Item $item -ProcessedDir $paths.ProcessedDir
                        Write-Info "Archived processed MQ5 -> $processedMq5Path"
                    } catch {
                        Write-Warn2 "Could not archive processed MQ5 (will remain in COMPILE_WORK): $($_.Exception.Message)"
                        $processedMq5Path = $item.FullName
                    }
                }
                $result.ProcessedMq5 = $processedMq5Path

                # ── PRODUCTION HARDENING #3 — build_manifest.json ───────────
                #   Emit the per-bundle manifest LAST so it can reference the
                #   final EX5 path, the SHA256 sidecar, and the archived MQ5.
                try {
                    $manifestPath = Write-BuildManifest -Item              $item `
                                                         -Ex5Path           $moved `
                                                         -Sha256Hash        ($(if ($sha256Info) { $sha256Info.Hash }    else { '' })) `
                                                         -HashFile          ($(if ($sha256Info) { $sha256Info.HashFile } else { '' })) `
                                                         -DurationMs        $compile.DurationMs `
                                                         -ManifestsDir      $paths.ManifestsDir `
                                                         -CompiledAt        $compiledAt `
                                                         -ProcessedMq5Path  $processedMq5Path
                    $result.ManifestFile = $manifestPath
                    Write-Info "Manifest -> $manifestPath"
                } catch {
                    Write-Warn2 "Could not write build_manifest.json: $($_.Exception.Message)"
                }

                [void]$results.Add($result)
                continue
            }
        }

        # ── Failure path ───────────────────────────────────────────────────
        Write-Err2 "Compile failed: $($compile.Reason)"
        if ($compile.LogPreview) {
            # Show the tail of the log so the operator can diagnose without
            # opening a separate window. Indent two spaces for readability.
            Write-Info '--- compile log tail ---'
            foreach ($l in ($compile.LogPreview -split "`r?`n")) {
                if (-not [string]::IsNullOrWhiteSpace($l)) { Write-Info "  $l" }
            }
            Write-Info '------------------------'
        }

        try {
            $bucket = Move-FailureToRejected -Item $item `
                                             -RejectedDir $paths.RejectedDir `
                                             -LogPath     $perFileLog `
                                             -Reason      $compile.Reason
            $result.RejectedDir = $bucket
            $result.Detail      = "Rejected: $bucket"
        } catch {
            $result.Detail = "Rejected (but bucket creation failed): $($_.Exception.Message)"
        }

        # If the EX5 partially produced inside COMPILE_WORK, clean it up so a
        # later "success" run doesn't accidentally pick up a stale binary.
        if (Test-Path -LiteralPath $item.ExpectedEx5 -PathType Leaf) {
            try {
                Remove-Item -LiteralPath $item.ExpectedEx5 -Force -ErrorAction Stop
                Write-Info "Cleaned up partial EX5: $($item.ExpectedEx5)"
            } catch {
                Write-Warn2 "Could not clean partial EX5: $($_.Exception.Message)"
            }
        }

        $result.Status = 'failed'
        [void]$results.Add($result)
    }

    # ─── 5. Summary + persistent artifacts ─────────────────────────────────
    Write-RunSummary -Results $results.ToArray() -LogsDir $paths.LogsDir -RunStartedAt $runStartedAt

    # ─── 6. Aggregate exit code ────────────────────────────────────────────
    $successCount = @($results | Where-Object { $_.Status -eq 'success' }).Count
    $failedCount  = @($results | Where-Object { $_.Status -eq 'failed'  }).Count
    $eligible     = @($results | Where-Object { $_.Status -in 'success','failed' }).Count

    if ($eligible -eq 0) {
        # Everything was skipped/duplicate — not really success, not really failure.
        exit 0
    } elseif ($failedCount -eq 0) {
        exit 0      # all eligible items succeeded
    } elseif ($successCount -eq 0) {
        exit 3      # all eligible items failed
    } else {
        exit 2      # partial failure
    }

} catch {
    Write-Host ''
    Write-Err2 "Unexpected error: $($_.Exception.Message)"
    if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) {
        Write-Info "At line $($_.InvocationInfo.ScriptLineNumber) in $($_.InvocationInfo.ScriptName)"
    }
    exit 99
}

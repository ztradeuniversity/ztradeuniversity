<#
.SYNOPSIS
    ZTU MASTER ENGINE — central orchestrator for the MT5 licensing pipeline.

.DESCRIPTION
    End-to-end automation that:
      1. Reads pending license requests from Supabase
             status = compile_ready  -> full pipeline
             status = compiled       -> email-only retry
             status = rejected       -> mismatch email (once)
      2. Stages MQ5 per row via prepare_compile.ps1
      3. Injects the per-client account number into the staged MQ5
      4. Batch-compiles via compile_queue_engine.ps1
      5. Builds the per-client delivery ZIP via create_delivery_bundle.ps1
      6. Renders the success HTML email from
            templates\success_email.html  +  content\success_text.txt
         (or the mismatch email for rejected rows)
      7. Sends via Gmail SMTP (STARTTLS, 587) with the ZIP attached
      8. Moves the ZIP into DELIVERED\YYYY-MM-DD\
      9. Updates Supabase status -> emailed
     10. Appends to mailing_lists\*.csv (approved / rejected / all)
     11. Writes per-run + history audit logs in logs\

    SECURITY GUARANTEES
      * NEVER reads from SOURCE_MQ5 directly (prepare_compile.ps1 owns that)
      * NEVER attaches a .mq5 to any email
      * NEVER zips an MQ5
      * Re-verifies every ZIP entry before SMTP send (defence in depth on top
        of create_delivery_bundle.ps1's own scan)
      * Refuses to attach anything > Gmail's 25 MB cap
      * Gmail app password is read as SecureString and zero-freed after use

    DOES NOT MODIFY ANY EXISTING SCRIPT.
    All existing scripts are invoked as sub-processes.

.PARAMETER Root
    Root of the ZTU automation tree. Default: D:\ZTU_AUTOMATION

.PARAMETER SenderEmail
    Gmail address that will send all delivery + mismatch emails.

.PARAMETER AppPassword
    Gmail app password as a SecureString. Prompted if not supplied.

.PARAMETER MaxBatch
    Hard cap on the number of compile_ready rows processed per run.
    Default 50. Protects against runaway batches.

.PARAMETER DryRun
    Run every step EXCEPT the SMTP send + the Supabase status update.
    All logs / CSVs are still written so you can audit a planned run.

.PARAMETER ForceResend
    If an account is already in mailing_lists\approved_clients.csv, the
    orchestrator skips it by default. Pass -ForceResend to re-process
    it anyway (rebuilds the bundle and resends the email).

.PARAMETER SkipMismatchEmails
    Skip the rejected-row branch entirely (don't send any mismatch
    emails this run).

.PARAMETER AccountPlaceholder
    Token in the MQ5 source that the engine replaces with the
    per-client account number. Default: __ZTU_ACCOUNT__
    If the placeholder is not present in the MQ5, the engine logs a
    warning and proceeds — the EX5 will not be account-locked in that
    case. To enable account locking, add a line like:
        input long g_lic_account = __ZTU_ACCOUNT__;
    inside D:\ZTU_AUTOMATION\SOURCE_MQ5\ZTU_EA.mq5.

.EXAMPLE
    .\master_engine.ps1
    # Fully interactive — prompts for sender email + app password.

.EXAMPLE
    .\master_engine.ps1 -DryRun
    # Plans a run, writes logs, but sends no SMTP and updates no statuses.

.EXAMPLE
    .\master_engine.ps1 -SenderEmail ops@ztradeuniversity.com -MaxBatch 10

.NOTES
    Exit codes:
       0   Success — every targeted row processed (some may be skipped)
       1   Invalid input / configuration error
       2   Required folder, template, or content file missing
       3   Supabase fetch failed
       4   compile_queue_engine.ps1 reported zero successes (no rows to deliver)
       5   SMTP credentials missing / authentication failed at first send
       6   Critical safety guard tripped (MQ5 detected inside a bundle)
      99   Unexpected error
#>

[CmdletBinding()]
param(
    [string]$Root              = 'D:\ZTU_AUTOMATION',
    [string]$SenderEmail,
    [System.Security.SecureString]$AppPassword,
    [int]$MaxBatch             = 50,
    [switch]$DryRun,
    [switch]$ForceResend,
    [switch]$SkipMismatchEmails,
    [switch]$SkipOutbox,                                     # Phase 15.5A: skip email_outbox drain
    [string]$AccountPlaceholder = '__ZTU_ACCOUNT__'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# ═══════════════════════════════════════════════════════════════════════════
#  Supabase configuration
#  ───────────────────────────────────────────────────────────────────────────
#  Phase 18.1 Stage 1 — engine now prefers the service_role key.
#
#  Two keys are declared:
#    $script:SupabaseAnonKey    — public key (browser-side), still safe under
#                                 today's RLS but will be locked out once
#                                 Stages 4-6 tighten policies.  Kept as the
#                                 fallback during the transition window.
#    $script:SupabaseServiceKey — service_role key (server-side ONLY).  Paste
#                                 it from Supabase → Settings → API → "service
#                                 role secret".  When set, the engine uses it
#                                 for every REST call, which means the engine
#                                 will continue to work after we revoke anon
#                                 INSERT/UPDATE/DELETE on production tables.
#
#  IMPORTANT — security:
#    The service_role key bypasses RLS entirely.  Keep this file (and the
#    repo it lives in) PRIVATE.  Never commit it to a public GitHub repo.
#    The file already lives on the engine host only (D:\ZTU_AUTOMATION\) and
#    is not shipped to Cloudflare Pages, so this is safe.
#
#  $script:SupabaseAuthKey is computed below as: service if set, else anon.
#  Every Invoke-WebRequest in the engine reads $script:SupabaseAuthKey, so
#  toggling between keys is a one-line edit.
# ═══════════════════════════════════════════════════════════════════════════
$script:SupabaseUrl        = 'https://yivkkfplrkcncjaqifxb.supabase.co'
$script:SupabaseAnonKey    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpdmtrZnBscmtjbmNqYXFpZnhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjQ5MjcsImV4cCI6MjA5NDkwMDkyN30._CC6KIPVOhzMyOnLDtTpLbtMwee8y-991YFpoC3eC5Q'
$script:SupabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpdmtrZnBscmtjbmNqYXFpZnhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTMyNDkyNywiZXhwIjoyMDk0OTAwOTI3fQ.vIzwK1VLBfCTnXl-rIo3jvHu2QphHdQUpaGauszeJqY'
if ([string]::IsNullOrWhiteSpace($script:SupabaseServiceKey)) {
    $script:SupabaseAuthKey = $script:SupabaseAnonKey
    Write-Host '[Phase18.1] Using anon key (SupabaseServiceKey is empty).' -ForegroundColor Yellow
} else {
    $script:SupabaseAuthKey = $script:SupabaseServiceKey
    Write-Host '[Phase18.1] Using service_role key (bypasses RLS).' -ForegroundColor Cyan
}
$script:Table              = 'license_requests'

# Status constants (mirror admin-upload-report.html / compile-dashboard.html)
$STATUS_COMPILE_READY = 'compile_ready'
$STATUS_MATCHED       = 'matched'
$STATUS_APPROVED      = 'approved'
$STATUS_COMPILING     = 'compiling'
$STATUS_COMPILED      = 'compiled'
$STATUS_EMAILED       = 'emailed'
$STATUS_REJECTED      = 'rejected'

$READY_STATUSES_QUERY = "in.($STATUS_COMPILE_READY,$STATUS_MATCHED,$STATUS_APPROVED)"

# ═══════════════════════════════════════════════════════════════════════════
#  Output helpers
# ═══════════════════════════════════════════════════════════════════════════
$script:LogLines = New-Object System.Collections.Generic.List[string]
function Write-Step  ([string]$msg) { $line = '[STEP]  ' + $msg; $script:LogLines.Add($line); Write-Host '[STEP]  ' -ForegroundColor Cyan      -NoNewline; Write-Host $msg }
function Write-Ok    ([string]$msg) { $line = '[OK]    ' + $msg; $script:LogLines.Add($line); Write-Host '[OK]    ' -ForegroundColor Green     -NoNewline; Write-Host $msg }
function Write-Info  ([string]$msg) { $line = '[INFO]  ' + $msg; $script:LogLines.Add($line); Write-Host '[INFO]  ' -ForegroundColor DarkGray  -NoNewline; Write-Host $msg -ForegroundColor DarkGray }
function Write-Warn2 ([string]$msg) { $line = '[WARN]  ' + $msg; $script:LogLines.Add($line); Write-Host '[WARN]  ' -ForegroundColor Yellow    -NoNewline; Write-Host $msg -ForegroundColor Yellow }
function Write-Err2  ([string]$msg) { $line = '[ERROR] ' + $msg; $script:LogLines.Add($line); Write-Host '[ERROR] ' -ForegroundColor Red       -NoNewline; Write-Host $msg -ForegroundColor Red }

# ═══════════════════════════════════════════════════════════════════════════
#  SecureString → plaintext (zeroed immediately after use by caller)
# ═══════════════════════════════════════════════════════════════════════════
function ConvertFrom-SecureToPlain([System.Security.SecureString]$secure) {
    if (-not $secure) { return $null }
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try   { return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally{ [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# ═══════════════════════════════════════════════════════════════════════════
#  CONTENT + TEMPLATE PARSING
# ═══════════════════════════════════════════════════════════════════════════

# Parse a content .txt file using the --- KEY --- section format. Returns
# a hashtable { KEY = "value" }. Lines starting with `#` outside of any
# section are treated as comments; lines starting with `#` inside a section
# are preserved as content.
function Read-ContentSections([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Content file missing: $Path"
    }
    $text = Get-Content -LiteralPath $Path -Raw -Encoding utf8
    $sections   = @{}
    $currentKey = $null
    $sb         = New-Object System.Text.StringBuilder
    foreach ($line in ($text -split "`r?`n")) {
        if ($line -match '^---\s*(.+?)\s*---\s*$') {
            if ($currentKey) {
                $sections[$currentKey] = $sb.ToString().TrimEnd("`r","`n"," ","`t")
                [void]$sb.Clear()
            }
            $currentKey = $Matches[1].Trim()
        } elseif ($currentKey) {
            [void]$sb.AppendLine($line)
        }
        # Lines before the first --- KEY --- (header comments) are ignored.
    }
    if ($currentKey) {
        $sections[$currentKey] = $sb.ToString().TrimEnd("`r","`n"," ","`t")
    }
    return $sections
}

# Substitute every {{KEY}} in $Html with the value from $Map. Keys whose
# value is missing are replaced with the empty string (and logged once).
function Format-Template([string]$Html, [hashtable]$Map) {
    $out = $Html
    # Replace every known key first.
    foreach ($k in $Map.Keys) {
        $out = $out.Replace('{{' + $k + '}}', [string]$Map[$k])
    }
    # Any remaining {{...}} tokens become empty (defensive — never leak
    # raw placeholders into a customer email).
    $leftovers = [regex]::Matches($out, '\{\{[A-Za-z0-9_]+\}\}')
    if ($leftovers.Count -gt 0) {
        $names = ($leftovers | ForEach-Object { $_.Value } | Sort-Object -Unique) -join ', '
        Write-Warn2 "Unresolved template placeholders blanked out: $names"
        $out = [regex]::Replace($out, '\{\{[A-Za-z0-9_]+\}\}', '')
    }
    return $out
}

# ═══════════════════════════════════════════════════════════════════════════
#  SUPABASE REST CLIENT
# ═══════════════════════════════════════════════════════════════════════════
function Invoke-SupabaseRequest {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [string]$Method = 'GET',
        $Body
    )
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Content-Type'  = 'application/json'
        'Prefer'        = 'return=representation'
    }
    $uri = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1' + $Path
    $params = @{
        Uri         = $uri
        Method      = $Method
        Headers     = $headers
        ErrorAction = 'Stop'
        TimeoutSec  = 30
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
    }
    return Invoke-RestMethod @params
}

function Get-RequestsByStatus([string]$StatusOrFilter) {
    # Accepts either a single status ('rejected') or a PostgREST filter
    # expression ('in.(matched,compile_ready,approved)').
    $value = if ($StatusOrFilter -match '^[a-z]+\.') { $StatusOrFilter } else { "eq.$StatusOrFilter" }
    $path = "/$script:Table" + "?status=$value&select=id,account_number,email,broker_name,status,created_at,screenshot_url&order=created_at.asc"
    return @(Invoke-SupabaseRequest -Path $path)
}

function Update-RequestStatus {
    param(
        [Parameter(Mandatory)] [string]$Id,
        [Parameter(Mandatory)] [string]$NewStatus,
        [string[]]$AllowedFromStatuses
    )
    $path = "/$script:Table" + "?id=eq.$Id"
    if ($AllowedFromStatuses -and $AllowedFromStatuses.Count -gt 0) {
        $path = $path + '&status=in.(' + ($AllowedFromStatuses -join ',') + ')'
    }
    return Invoke-SupabaseRequest -Path $path -Method PATCH -Body @{ status = $NewStatus }
}

# ═══════════════════════════════════════════════════════════════════════════
#  Phase 16 — broker_accounts auto-match helpers
#  Same per-row-emit pattern as Get-EmailOutboxPending to defeat the
#  PS 5.1 row-flatten quirk on multi-row JSON arrays.
# ═══════════════════════════════════════════════════════════════════════════

function Normalize-AccountId([string]$raw) {
    if ([string]::IsNullOrWhiteSpace($raw)) { return '' }
    $s = $raw.Trim() -replace ',', '' -replace '\s+', ''
    if ($s -match '\.0+$') { $s = $s -replace '\.0+$', '' }
    return $s
}

function Get-BrokerAccountNumbers([int]$Limit = 10000) {
    # Returns each broker_accounts.account_number as a separate string on
    # the pipeline.  Caller collects with @(Get-BrokerAccountNumbers).
    $path = "/broker_accounts?select=account_number&limit=$Limit"
    $uri  = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1' + $path
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Accept'        = 'application/json'
    }
    try {
        $resp = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers `
                  -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        $json = [string]$resp.Content
        if ([string]::IsNullOrWhiteSpace($json) -or $json -eq '[]') { return }
        Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
        $jss = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $jss.MaxJsonLength = [Int32]::MaxValue
        $parsed = $jss.DeserializeObject($json)
        foreach ($r in $parsed) {
            if ($r -and $r.ContainsKey('account_number')) {
                Write-Output ([string]$r['account_number'])
            }
        }
    } catch {
        Write-Warn2 "Get-BrokerAccountNumbers failed: $($_.Exception.Message)"
    }
}

function Get-LicenseRequestById([string]$Id) {
    # Phase 16.5 PART A — fetch a single license_requests row by id so STEP 2.6
    # can re-send delivery (account_number, email, broker_name).  Returns $null on
    # any failure so the caller can degrade gracefully.
    if ([string]::IsNullOrWhiteSpace($Id)) { return $null }
    $path = "/$script:Table" + "?id=eq.$Id&select=id,account_number,email,status,broker_name,whatsapp_number,created_at&limit=1"
    $uri  = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1' + $path
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Accept'        = 'application/json'
    }
    try {
        $resp = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers `
                  -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        $json = [string]$resp.Content
        if ([string]::IsNullOrWhiteSpace($json) -or $json -eq '[]') { return $null }
        Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
        $jss = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $jss.MaxJsonLength = [Int32]::MaxValue
        $parsed = $jss.DeserializeObject($json)
        if (-not $parsed -or $parsed.Count -eq 0) { return $null }
        $r = $parsed[0]
        $row = New-Object PSObject
        foreach ($k in $r.Keys) {
            Add-Member -InputObject $row -MemberType NoteProperty -Name $k -Value $r[$k]
        }
        return $row
    } catch {
        Write-Warn2 "Get-LicenseRequestById($Id) failed: $($_.Exception.Message)"
        return $null
    }
}

# ═══════════════════════════════════════════════════════════════════════════
#  Phase 16.5 PART A — resend_requests helpers (dashboard RESEND button queue)
# ═══════════════════════════════════════════════════════════════════════════
function Get-PendingResendRequests([int]$Limit = 100) {
    # Per-row emit (PS 5.1 row-flatten safe).  Returns id, license_request_id,
    # account_number, recipient_email, requested_by for each resend_requests
    # row with status='pending'.
    $path = "/resend_requests?status=eq.pending&select=id,license_request_id,account_number,recipient_email,requested_by,created_at&order=created_at.asc&limit=$Limit"
    $uri  = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1' + $path
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Accept'        = 'application/json'
    }
    try {
        $resp = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers `
                  -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        $json = [string]$resp.Content
        if ([string]::IsNullOrWhiteSpace($json) -or $json -eq '[]') { return }
        Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
        $jss = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $jss.MaxJsonLength = [Int32]::MaxValue
        $parsed = $jss.DeserializeObject($json)
        foreach ($r in $parsed) {
            $row = New-Object PSObject
            foreach ($key in $r.Keys) {
                Add-Member -InputObject $row -MemberType NoteProperty -Name $key -Value $r[$key]
            }
            Write-Output $row
        }
    } catch {
        Write-Warn2 "Get-PendingResendRequests failed (table may not exist): $($_.Exception.Message)"
    }
}

function Update-ResendRequestStatus {
    # PATCH resend_requests row. Optionally requires current status (for atomic claim).
    # Sets consumed_at automatically when NewStatus == 'consumed'.
    param(
        [Parameter(Mandatory)] [string]$Id,
        [Parameter(Mandatory)] [string]$NewStatus,
        [string]$RequireCurrentStatus
    )
    $path = "/resend_requests?id=eq.$Id"
    if (-not [string]::IsNullOrWhiteSpace($RequireCurrentStatus)) {
        $path = $path + '&status=eq.' + $RequireCurrentStatus
    }
    $uri = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1' + $path
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Content-Type'  = 'application/json'
        'Prefer'        = 'return=minimal'
    }
    $bodyMap = @{ status = $NewStatus }
    if ($NewStatus -eq 'consumed') {
        $bodyMap['consumed_at'] = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $body = ($bodyMap | ConvertTo-Json -Compress)
    try {
        [void](Invoke-WebRequest -Uri $uri -Method PATCH -Headers $headers `
                 -Body $body -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop)
        return $true
    } catch {
        Write-Warn2 "Update-ResendRequestStatus($Id -> $NewStatus) failed: $($_.Exception.Message)"
        return $false
    }
}

function Get-LicenseRequestResendCount([string]$Id) {
    if ([string]::IsNullOrWhiteSpace($Id)) { return 0 }
    $uri = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1/' + $script:Table + '?id=eq.' + $Id + '&select=resend_count&limit=1'
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Accept'        = 'application/json'
    }
    try {
        $resp = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers `
                  -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        $json = [string]$resp.Content
        if ([string]::IsNullOrWhiteSpace($json) -or $json -eq '[]') { return 0 }
        Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
        $jss = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $parsed = $jss.DeserializeObject($json)
        if (-not $parsed -or $parsed.Count -eq 0) { return 0 }
        $v = $parsed[0]['resend_count']
        if ($null -eq $v) { return 0 }
        return [int]$v
    } catch { return 0 }
}

# ═══════════════════════════════════════════════════════════════════════════
#  Phase 16.5 PART C — ib_changed_accounts helper (delivery block gate)
# ═══════════════════════════════════════════════════════════════════════════
function Get-IbChangedAccountSet([int]$Limit = 5000) {
    # Returns a hashtable<accountNumberString,$true> for fast O(1) exclusion
    # check in STEP 4.  Engine rule: any license_request whose account_number
    # is in ib_changed_accounts MUST NOT compile or deliver — auto-flip to
    # status='ib_changed' instead so the dashboard can show the block reason.
    $result = @{}
    $uri = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1/ib_changed_accounts?select=account_number&limit=' + $Limit
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Accept'        = 'application/json'
    }
    try {
        $resp = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers `
                  -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        $json = [string]$resp.Content
        if ([string]::IsNullOrWhiteSpace($json) -or $json -eq '[]') { return $result }
        Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
        $jss = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $jss.MaxJsonLength = [Int32]::MaxValue
        $parsed = $jss.DeserializeObject($json)
        foreach ($r in $parsed) {
            if ($r -and $r.ContainsKey('account_number')) {
                $a = Normalize-AccountId ([string]$r['account_number'])
                if ($a) { $result[$a] = $true }
            }
        }
    } catch {
        Write-Warn2 "Get-IbChangedAccountSet failed (table may not exist; gate becomes no-op): $($_.Exception.Message)"
    }
    return $result
}

function Get-PendingLicenseRequests([int]$Limit = 500) {
    # Per-row emit. Returns id + account_number for each pending license_request.
    $path = "/$script:Table" + "?status=eq.pending&select=id,account_number&order=created_at.asc&limit=$Limit"
    $uri  = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1' + $path
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Accept'        = 'application/json'
    }
    try {
        $resp = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers `
                  -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        $json = [string]$resp.Content
        if ([string]::IsNullOrWhiteSpace($json) -or $json -eq '[]') { return }
        Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
        $jss = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $jss.MaxJsonLength = [Int32]::MaxValue
        $parsed = $jss.DeserializeObject($json)
        foreach ($r in $parsed) {
            $row = New-Object PSObject
            foreach ($key in $r.Keys) {
                Add-Member -InputObject $row -MemberType NoteProperty -Name $key -Value $r[$key]
            }
            Write-Output $row
        }
    } catch {
        Write-Warn2 "Get-PendingLicenseRequests failed: $($_.Exception.Message)"
    }
}

# ═══════════════════════════════════════════════════════════════════════════
#  Phase 15.5A — email_outbox helpers
#  These poll/update the new outbox table the dashboard writes to. They
#  reuse Invoke-SupabaseRequest above and the same anon-key Authorization.
# ═══════════════════════════════════════════════════════════════════════════
function Get-EmailOutboxPending([int]$Limit = 50) {
    # Phase 15.5D — defeats the PS 5.1 quirk that was collapsing N pending
    # rows into a single PSCustomObject with array-valued properties
    # (causing PostgreSQL 22P02 invalid_text_representation for type uuid
    # when STEP 8.5 PATCHed id=eq.<space-joined-UUIDs>).
    #
    # Verified-working pattern: emit each row INDIVIDUALLY via Write-Output
    # to the pipeline.  The caller's @(Get-EmailOutboxPending) wrapper
    # collects them into a proper Object[] of N PSObjects.
    #
    # Isolated to this one function — STEP 8.5 logic and every other
    # engine function are untouched.  Returns nothing when empty or on
    # error (caller's @() yields Object[0]).
    $cols = 'id,template_type,recipient_email,recipient_account,subject,body_html,body_text,request_id,created_at,retry_count'
    $path = "/email_outbox?status=eq.pending&select=$cols&order=created_at.asc&limit=$Limit"
    $uri  = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1' + $path
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Accept'        = 'application/json'
    }
    try {
        $resp = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers `
                  -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        $json = [string]$resp.Content
        if ([string]::IsNullOrWhiteSpace($json) -or $json -eq '[]') {
            return   # emit nothing — caller sees Object[0]
        }
        Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
        $jss = New-Object System.Web.Script.Serialization.JavaScriptSerializer
        $jss.MaxJsonLength = [Int32]::MaxValue
        $parsed = $jss.DeserializeObject($json)
        # $parsed is Object[] of Dictionary<string,object> — one per DB row.
        # Emit one PSObject per row to the pipeline (no Add to a list).
        foreach ($r in $parsed) {
            $row = New-Object PSObject
            foreach ($key in $r.Keys) {
                Add-Member -InputObject $row -MemberType NoteProperty -Name $key -Value $r[$key]
            }
            Write-Output $row
        }
    } catch {
        $errMsg = $_.Exception.Message
        $errBody = $null
        if ($_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $errBody = $reader.ReadToEnd()
            } catch {}
        }
        Write-Warn2 "Get-EmailOutboxPending failed: $errMsg"
        if ($errBody) { Write-Warn2 "  PostgREST body: $errBody" }
        return   # emit nothing
    }
}

function Update-EmailOutboxStatus {
    # Phase 15.5C rewrite: dedicated outbox PATCH using Prefer: return=minimal +
    # count=exact.  Avoids the (400) Bad Request triggered by PostgREST trying to
    # re-SELECT the row under a freshly-created RLS policy.  Captures the full
    # error response body on any non-2xx so failures are diagnosable.
    #
    # Returns hashtable: @{ ok=$true/$false; affected=<int>; statusCode=<int>;
    #                       errorMessage=<string>; errorBody=<string> }
    param(
        [Parameter(Mandatory)] [string]$Id,
        [Parameter(Mandatory)] [string]$NewStatus,
        [string]$RequireCurrentStatus,
        [hashtable]$ExtraFields
    )
    $path = "/email_outbox?id=eq.$Id"
    if ($RequireCurrentStatus) { $path += "&status=eq.$RequireCurrentStatus" }

    $body = @{ status = $NewStatus }
    if ($ExtraFields) {
        foreach ($k in $ExtraFields.Keys) { $body[$k] = $ExtraFields[$k] }
    }

    $uri = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1' + $path
    $headers = @{
        'apikey'        = $script:SupabaseAuthKey
        'Authorization' = 'Bearer ' + $script:SupabaseAuthKey
        'Content-Type'  = 'application/json'
        'Prefer'        = 'return=minimal,count=exact'
    }
    $jsonBody = ($body | ConvertTo-Json -Depth 8 -Compress)

    try {
        $resp = Invoke-WebRequest -Uri $uri -Method PATCH -Headers $headers `
                  -Body $jsonBody -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        # PostgREST returns "Content-Range: 0-0/1" when one row matched, or
        # "Content-Range: */0" when zero matched.  Parse to determine claim outcome.
        $affected = 1
        $cr = $null
        if ($resp.Headers -and $resp.Headers['Content-Range']) {
            $cr = [string]$resp.Headers['Content-Range']
            if ($cr -match '/(\d+)\s*$') { $affected = [int]$Matches[1] }
        }
        return @{
            ok           = $true
            affected     = $affected
            statusCode   = [int]$resp.StatusCode
            contentRange = $cr
            errorMessage = $null
            errorBody    = $null
        }
    } catch {
        # Capture PostgREST error body (contains JSON with code/details/hint/message).
        $statusCode  = 0
        $errorBody   = $null
        if ($_.Exception.Response) {
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $stream.Position = 0
                $reader = New-Object System.IO.StreamReader($stream)
                $errorBody = $reader.ReadToEnd()
            } catch {}
        }
        return @{
            ok           = $false
            affected     = 0
            statusCode   = $statusCode
            errorMessage = $_.Exception.Message
            errorBody    = $errorBody
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════
#  CSV APPEND / DEDUP
# ═══════════════════════════════════════════════════════════════════════════
function Test-AlreadyApproved {
    # ENTERPRISE CONTRACT: dedup key is account_number ONLY.
    # The $Broker parameter is preserved for caller-compatibility but IGNORED on purpose.
    # Broker name is informational; the same account at any broker is treated as the same license.
    param(
        [Parameter(Mandatory)] [string]$ApprovedCsv,
        [Parameter(Mandatory)] [string]$Account,
        [string]$Broker
    )
    if (-not (Test-Path -LiteralPath $ApprovedCsv -PathType Leaf)) { return $false }
    $rows = @(Import-Csv -LiteralPath $ApprovedCsv)
    foreach ($r in $rows) {
        if ($r.account_number -eq $Account) { return $true }
    }
    return $false
}

function Test-AlreadyRejected {
    # ENTERPRISE CONTRACT: dedup key is (account_number + email) ONLY.
    # The $Broker parameter is preserved for caller-compatibility but IGNORED on purpose.
    # Same account/email pair is treated as the same client regardless of broker label.
    param(
        [Parameter(Mandatory)] [string]$RejectedCsv,
        [Parameter(Mandatory)] [string]$Account,
        [string]$Broker,
        [Parameter(Mandatory)] [string]$Email
    )
    if (-not (Test-Path -LiteralPath $RejectedCsv -PathType Leaf)) { return $false }
    $rows = @(Import-Csv -LiteralPath $RejectedCsv)
    foreach ($r in $rows) {
        if (($r.account_number -eq $Account) -and ($r.email -eq $Email)) { return $true }
    }
    return $false
}

# Append a fully-shaped row to a CSV, creating the header if the file is
# new. The header is taken from the row's property order so future scripts
# that add columns don't break older files (back-fill via -NormaliseHeader).
function Add-CsvRow {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [pscustomobject]$Row
    )
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
        New-Item -ItemType Directory -Path $dir -Force -ErrorAction Stop | Out-Null
    }
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $Row | Export-Csv -LiteralPath $Path -NoTypeInformation -Append -Encoding UTF8 -ErrorAction Stop
    } else {
        $Row | Export-Csv -LiteralPath $Path -NoTypeInformation         -Encoding UTF8 -ErrorAction Stop
    }
}

# ═══════════════════════════════════════════════════════════════════════════
#  HTML EMAIL SEND  (Gmail SMTP, STARTTLS 587)
# ═══════════════════════════════════════════════════════════════════════════
function Send-HtmlEmail {
    param(
        [Parameter(Mandatory)] [string]$From,
        [Parameter(Mandatory)] [string]$FromName,
        [Parameter(Mandatory)] [System.Net.NetworkCredential]$NetCredential,
        [Parameter(Mandatory)] [string]$To,
        [Parameter(Mandatory)] [string]$Subject,
        [Parameter(Mandatory)] [string]$HtmlBody,
        [string]$AttachmentPath
    )
    $message = New-Object System.Net.Mail.MailMessage
    $smtp    = $null
    try {
        $message.From            = New-Object System.Net.Mail.MailAddress($From, $FromName)
        $message.To.Add($To)     | Out-Null
        $message.Subject         = $Subject
        $message.Body            = $HtmlBody
        $message.IsBodyHtml      = $true
        $message.BodyEncoding    = [System.Text.Encoding]::UTF8
        $message.SubjectEncoding = [System.Text.Encoding]::UTF8

        if ($AttachmentPath) {
            $att      = New-Object System.Net.Mail.Attachment($AttachmentPath)
            $att.Name = Split-Path -Leaf $AttachmentPath
            $message.Attachments.Add($att) | Out-Null
        }

        $smtp = New-Object System.Net.Mail.SmtpClient('smtp.gmail.com', 587)
        $smtp.EnableSsl             = $true
        $smtp.DeliveryMethod        = [System.Net.Mail.SmtpDeliveryMethod]::Network
        $smtp.Credentials           = $NetCredential
        $smtp.Timeout               = 60000

        $smtp.Send($message)
    } finally {
        if ($message.Attachments.Count -gt 0) { foreach ($a in $message.Attachments) { $a.Dispose() } }
        $message.Dispose()
        if ($smtp) { $smtp.Dispose() }
    }
}

# ═══════════════════════════════════════════════════════════════════════════
#  SECURITY GAUNTLET — runs against every ZIP before it's attached.
#  Mirrors the checks in send_delivery_email.ps1 so the orchestrator has
#  defence-in-depth even if create_delivery_bundle.ps1 is ever bypassed.
# ═══════════════════════════════════════════════════════════════════════════
function Test-ZipSafeForDelivery {
    param(
        [Parameter(Mandatory)] [string]$ZipPath,
        [int]$MaxMB = 25
    )
    if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
        return @{ Ok = $false; Reason = "ZIP not found: $ZipPath" }
    }
    $fi = Get-Item -LiteralPath $ZipPath
    if ($fi.Length -le 0)                  { return @{ Ok = $false; Reason = 'ZIP is empty.' } }
    if ($fi.Length -gt ($MaxMB*1024*1024)) { return @{ Ok = $false; Reason = "ZIP exceeds ${MaxMB} MB cap." } }

    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
    $arch = $null
    try {
        $arch    = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
        $entries = @($arch.Entries)
        if ($entries.Count -eq 0) { return @{ Ok = $false; Reason = 'ZIP has zero entries.' } }
        # MQ5 leak guard
        $mq5 = @($entries | Where-Object { $_.FullName -match '(?i)\.mq5$' })
        if ($mq5.Count -gt 0) {
            return @{ Ok = $false; Reason = "MQ5 file(s) detected inside ZIP: $($mq5[0].FullName)" }
        }
        # Path-traversal / absolute guard
        $bad = @($entries | Where-Object {
            $n = $_.FullName
            ($n -match '\.\.') -or ($n -match '^[\\/]') -or ($n -match ':[\\/]')
        })
        if ($bad.Count -gt 0) {
            return @{ Ok = $false; Reason = "Unsafe path inside ZIP: $($bad[0].FullName)" }
        }
        # Must contain at least one EX5
        $ex5 = @($entries | Where-Object { $_.FullName -match '(?i)\.ex5$' })
        if ($ex5.Count -eq 0) { return @{ Ok = $false; Reason = 'ZIP contains no EX5 file.' } }
        return @{ Ok = $true; EntryCount = $entries.Count; Ex5Count = $ex5.Count }
    } catch {
        return @{ Ok = $false; Reason = "Could not read ZIP: $($_.Exception.Message)" }
    } finally {
        if ($arch) { $arch.Dispose() }
    }
}

# ═══════════════════════════════════════════════════════════════════════════
#  CALL EXISTING WORKER SCRIPTS (as sub-processes — never modify them)
# ═══════════════════════════════════════════════════════════════════════════
function Invoke-PrepareCompile {
    param(
        [Parameter(Mandatory)] [string]$ScriptPath,
        [Parameter(Mandatory)] [string]$AccountNumber,
        [Parameter(Mandatory)] [string]$Broker,
        [Parameter(Mandatory)] [string]$Root
    )
    $proc = & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -AccountNumber $AccountNumber -Broker $Broker -Root $Root 2>&1
    return @{ ExitCode = $LASTEXITCODE; Output = ($proc -join [Environment]::NewLine) }
}

function Invoke-CompileQueue {
    param(
        [Parameter(Mandatory)] [string]$ScriptPath,
        [Parameter(Mandatory)] [string]$Root,
        [switch]$DryRun
    )
    $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$ScriptPath,'-Root',$Root)
    if ($DryRun) { $args += '-DryRun' }
    $proc = & powershell @args 2>&1
    return @{ ExitCode = $LASTEXITCODE; Output = ($proc -join [Environment]::NewLine) }
}

function Invoke-CreateDeliveryBundle {
    param(
        [Parameter(Mandatory)] [string]$ScriptPath,
        [Parameter(Mandatory)] [string]$AccountNumber,
        [Parameter(Mandatory)] [string]$Broker,
        [Parameter(Mandatory)] [string]$Root
    )
    $proc = & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath -AccountNumber $AccountNumber -Broker $Broker -Root $Root -Force 2>&1
    return @{ ExitCode = $LASTEXITCODE; Output = ($proc -join [Environment]::NewLine) }
}

# ═══════════════════════════════════════════════════════════════════════════
#  PER-CLIENT ACCOUNT INJECTION INTO STAGED MQ5
#  Replaces the configured placeholder with the digits-only account number.
#  Non-destructive: if the placeholder is absent, logs a warning and leaves
#  the file untouched (EX5 will compile but won't be account-locked).
# ═══════════════════════════════════════════════════════════════════════════
function Set-Mq5AccountNumber {
    param(
        [Parameter(Mandatory)] [string]$Mq5Path,
        [Parameter(Mandatory)] [string]$AccountNumber,
        [Parameter(Mandatory)] [string]$Placeholder
    )
    if (-not (Test-Path -LiteralPath $Mq5Path -PathType Leaf)) { throw "MQ5 not found: $Mq5Path" }
    if ($AccountNumber -notmatch '^[0-9]+$') { throw "AccountNumber must be digits only: $AccountNumber" }
    $raw = Get-Content -LiteralPath $Mq5Path -Raw -Encoding utf8
    if ($raw -notmatch [regex]::Escape($Placeholder)) {
        return @{ Replaced = 0; Note = "Placeholder '$Placeholder' not found in MQ5; EX5 will not be account-locked." }
    }
    $replaced = ([regex]::Matches($raw, [regex]::Escape($Placeholder))).Count
    $new = $raw.Replace($Placeholder, $AccountNumber)
    # Write back preserving UTF8 (no BOM) to keep MetaEditor happy.
    [System.IO.File]::WriteAllText($Mq5Path, $new, (New-Object System.Text.UTF8Encoding($false)))
    return @{ Replaced = $replaced; Note = "Injected $AccountNumber into $replaced placeholder(s)." }
}

# ═══════════════════════════════════════════════════════════════════════════
#  Helper: derive bundle filename pieces.
# ═══════════════════════════════════════════════════════════════════════════
function Get-SafeBroker([string]$Broker) {
    # Broker name is INFORMATIONAL ONLY. Orchestration depends on account_number only.
    # If the broker is null / empty / whitespace / has zero alphanumeric characters,
    # fall back to 'UNKNOWNBROKER' so the hardened worker scripts (which still require
    # a non-empty broker label) continue working. Filenames + emails remain consistent.
    $s = ($Broker -replace '[^a-zA-Z0-9]', '')
    if ([string]::IsNullOrEmpty($s)) { return 'UNKNOWNBROKER' }
    return $s
}
function Get-BundleBaseName([string]$Broker, [string]$Account) {
    return ("ZTU_{0}_{1}" -f (Get-SafeBroker $Broker), $Account)
}

# ═══════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════
$startedAt = Get-Date
Write-Host ''
Write-Host '+======================================================+' -ForegroundColor DarkYellow
Write-Host '|   ZTU MASTER ENGINE                                  |' -ForegroundColor DarkYellow
Write-Host '+======================================================+' -ForegroundColor DarkYellow
Write-Host ''

try {
    # ── 0. Resolve paths + validate environment ────────────────────────────
    Write-Step 'Validating environment...'
    $paths = @{
        Root                    = $Root
        SourceMq5Dir            = Join-Path $Root 'SOURCE_MQ5'
        WorkDir                 = Join-Path $Root 'COMPILE_WORK'
        CompiledDir             = Join-Path $Root 'COMPILED_EX5'
        ReadyDir                = Join-Path $Root 'READY_TO_SEND'
        DeliveredDir            = Join-Path $Root 'DELIVERED'
        RejectedDir             = Join-Path $Root 'REJECTED'
        TemplatesDir            = Join-Path $Root 'templates'
        ContentDir              = Join-Path $Root 'content'
        MailingListsDir         = Join-Path $Root 'mailing_lists'
        LogsDir                 = Join-Path $Root 'logs'
        ManifestsDir            = Join-Path (Join-Path $Root 'COMPILED_EX5') 'manifests'
        PrepareCompileScript    = Join-Path $Root 'prepare_compile.ps1'
        CompileQueueScript      = Join-Path $Root 'compile_queue_engine.ps1'
        CreateBundleScript      = Join-Path $Root 'create_delivery_bundle.ps1'
        SuccessTemplate         = Join-Path (Join-Path $Root 'templates') 'success_email.html'
        SuccessContent          = Join-Path (Join-Path $Root 'content')   'success_text.txt'
        MismatchTemplate        = Join-Path (Join-Path $Root 'templates') 'mismatch_email.html'
        MismatchContent         = Join-Path (Join-Path $Root 'content')   'mismatch_text.txt'
        ApprovedCsv             = Join-Path (Join-Path $Root 'mailing_lists') 'approved_clients.csv'
        RejectedCsv             = Join-Path (Join-Path $Root 'mailing_lists') 'rejected_clients.csv'
        AllCsv                  = Join-Path (Join-Path $Root 'mailing_lists') 'all_clients.csv'
    }

    # Hard-required artefacts
    $required = @(
        $paths.SourceMq5Dir, $paths.WorkDir, $paths.CompiledDir, $paths.ReadyDir,
        $paths.DeliveredDir, $paths.TemplatesDir, $paths.ContentDir, $paths.MailingListsDir,
        $paths.LogsDir, $paths.PrepareCompileScript, $paths.CompileQueueScript,
        $paths.CreateBundleScript, $paths.SuccessTemplate, $paths.SuccessContent,
        $paths.MismatchTemplate, $paths.MismatchContent,
        $paths.ApprovedCsv, $paths.RejectedCsv, $paths.AllCsv
    )
    foreach ($p in $required) {
        if (-not (Test-Path -LiteralPath $p)) {
            Write-Err2 "Required path missing: $p"
            exit 2
        }
    }
    Write-Ok "Environment OK. Root: $Root"

    # ── 1. Credentials ─────────────────────────────────────────────────────
    $credFile = Join-Path $Root 'smtp_cred.xml'
    if (-not (Test-Path -LiteralPath $credFile -PathType Leaf)) {
        Write-Err2 "SMTP credential file not found: $credFile"
        Write-Err2 "Run once to create it: Get-Credential -UserName 'ztu.automation@gmail.com' | Export-Clixml -Path '$credFile'"
        exit 6
    }
    $smtpCred    = Import-Clixml -LiteralPath $credFile
    $SenderEmail = $smtpCred.UserName
    if ($SenderEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
        Write-Err2 "Sender email in credential file is malformed: $SenderEmail"; exit 1
    }
    if ($DryRun) { Write-Info 'DRY-RUN MODE: no SMTP send, no Supabase status update will be performed.' }

    # ── 2. Load templates + content (once per run) ─────────────────────────
    Write-Step 'Loading templates + content...'
    $successHtml      = Get-Content -LiteralPath $paths.SuccessTemplate  -Raw -Encoding utf8
    $mismatchHtml     = Get-Content -LiteralPath $paths.MismatchTemplate -Raw -Encoding utf8
    $successContent   = Read-ContentSections $paths.SuccessContent
    $mismatchContent  = Read-ContentSections $paths.MismatchContent
    Write-Ok ('Loaded success template ({0} keys), mismatch template ({1} keys).' -f $successContent.Count, $mismatchContent.Count)

    # ── 0.0 Phase 16.2: Consume pending engine_triggers (Run Now button) ────
    # Dashboard "Run Now" inserts a row into engine_triggers status='pending'.
    # The engine acknowledges those rows by flipping them to 'consumed' so the
    # admin can see in the dashboard that the trigger was honored on this tick.
    # The engine cycle runs the same logic regardless — this is purely an
    # audit trail so manual click + auto-tick both leave evidence.
    # Phase 18.2 CRITICAL FIX — the previous query referenced `requested_at`,
    # which does NOT exist in the live engine_triggers table.  PostgREST
    # returned HTTP 400 (42703 column does not exist) on every cycle, so
    # the engine never noticed Run Now triggers and the watcher always
    # treated the table as empty.  The actual columns the dashboard writes
    # and reads are: id, status, requested_by, created_at, consumed_at.
    $stat_triggersConsumed = 0
    try {
        $pendingTriggers = @()
        try {
            $uri = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1/engine_triggers?status=eq.pending&select=id,created_at,requested_by&order=created_at.asc&limit=50'
            $headers = @{ 'apikey'=$script:SupabaseAuthKey; 'Authorization'='Bearer '+$script:SupabaseAuthKey; 'Accept'='application/json' }
            $resp = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
            $json = [string]$resp.Content
            if (-not [string]::IsNullOrWhiteSpace($json) -and $json -ne '[]') {
                Add-Type -AssemblyName System.Web.Extensions -ErrorAction SilentlyContinue
                $jss = New-Object System.Web.Script.Serialization.JavaScriptSerializer
                $jss.MaxJsonLength = [Int32]::MaxValue
                $pendingTriggers = @($jss.DeserializeObject($json))
            }
        } catch {
            $resp = $_.Exception.Response
            $code = if ($resp) { [int]$resp.StatusCode } else { -1 }
            Write-Warn2 ("engine_triggers fetch failed [HTTP {0}]: {1}" -f $code, $_.Exception.Message)
        }
        if ($pendingTriggers.Count -gt 0) {
            Write-Step ("Phase 16.2 — found {0} pending Run Now trigger(s) — consuming..." -f $pendingTriggers.Count)
            foreach ($t in $pendingTriggers) {
                try {
                    $consumedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
                    $patchUri = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1/engine_triggers?id=eq.' + [string]$t.id
                    $patchHeaders = @{
                        'apikey'=$script:SupabaseAuthKey; 'Authorization'='Bearer '+$script:SupabaseAuthKey
                        'Content-Type'='application/json'; 'Prefer'='return=minimal'
                    }
                    $body = (@{ status='consumed'; consumed_at=$consumedAt } | ConvertTo-Json -Compress)
                    [void](Invoke-WebRequest -Uri $patchUri -Method PATCH -Headers $patchHeaders -Body $body -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop)
                    $stat_triggersConsumed++
                    Write-Ok ("Trigger #{0} consumed (requested {1})" -f $t.id, $t.created_at)
                } catch {
                    Write-Warn2 ("Trigger #{0} PATCH failed: {1}" -f $t.id, $_.Exception.Message)
                }
            }
        }
    } catch {
        Write-Warn2 ("Phase 16.2 trigger step failed (non-fatal): {0}" -f $_.Exception.Message)
    }

    # ── 2.5 Phase 16: Auto-match pending license_requests vs broker_accounts ─
    # Runs BEFORE the main Supabase query so any rows flipped from pending
    # to matched are immediately picked up by STEP 3's compile_ready/matched
    # filter and processed in this same run.  Skips silently if either
    # table is empty or broker_accounts doesn't exist (migration not run).
    $stat_autoMatched = 0
    try {
        Write-Step 'Phase 16 — auto-matching pending license_requests vs broker_accounts...'
        $brokerSet = @{}
        $brokerCount = 0
        foreach ($acct in (Get-BrokerAccountNumbers -Limit 10000)) {
            $norm = Normalize-AccountId $acct
            if ($norm) { $brokerSet[$norm] = $true; $brokerCount++ }
        }
        Write-Info "broker_accounts loaded: $brokerCount unique account number(s)"

        if ($brokerCount -gt 0) {
            $pendingCount = 0
            $matched      = 0
            foreach ($req in (Get-PendingLicenseRequests -Limit 500)) {
                $pendingCount++
                $reqAcct = Normalize-AccountId ([string]$req.account_number)
                if (-not $reqAcct) { continue }
                if ($brokerSet.ContainsKey($reqAcct)) {
                    try {
                        $upd = Update-RequestStatus -Id ([string]$req.id) -NewStatus 'matched' `
                                 -AllowedFromStatuses @('pending')
                        if ($upd) {
                            $matched++
                            $stat_autoMatched++
                            Write-Ok ("Auto-matched: license_requests.id={0} | account={1} -> 'matched'" -f $req.id, $reqAcct)
                        }
                    } catch {
                        Write-Warn2 ("Auto-match PATCH failed for id={0}: {1}" -f $req.id, $_.Exception.Message)
                    }
                }
            }
            Write-Ok ("Phase 16 auto-match: scanned {0} pending request(s), matched {1}." -f $pendingCount, $matched)
        } else {
            Write-Info 'broker_accounts empty (migration may not be run yet) — auto-match skipped.'
        }
    } catch {
        Write-Warn2 ("Phase 16 auto-match step failed (non-fatal): {0}" -f $_.Exception.Message)
    }

    # ── 3. Pull rows from Supabase ─────────────────────────────────────────
    Write-Step 'Querying Supabase for actionable rows...'
    $compileReadyRows = @()
    $compiledRetryRows = @()
    $rejectedRows = @()
    try {
        $compileReadyRows  = Get-RequestsByStatus $READY_STATUSES_QUERY
        $compiledRetryRows = Get-RequestsByStatus $STATUS_COMPILED
        if (-not $SkipMismatchEmails) {
            $rejectedRows  = Get-RequestsByStatus $STATUS_REJECTED
        }
    } catch {
        Write-Err2 "Supabase fetch failed: $($_.Exception.Message)"
        exit 3
    }
    Write-Ok ("compile_ready/matched: {0}  |  compiled retry: {1}  |  rejected: {2}" -f $compileReadyRows.Count, $compiledRetryRows.Count, $rejectedRows.Count)

    # ── 4. Apply batch cap + idempotency filter on compile_ready ──────────
    # Phase 16.5 PART C — IB Changed delivery block.
    # Build the ib_changed_accounts set ONCE; any compile_ready / matched /
    # approved / compiled row whose account_number is in this set is removed
    # from the pipeline and its license_requests.status is flipped to
    # 'ib_changed' so the dashboard can show the block reason.  No EX5 is
    # compiled, no email is sent.  If the table doesn't exist, the helper
    # returns an empty hashtable -> gate becomes a no-op.
    $stat_ibChangedBlocked = 0
    $ibChangedSet = Get-IbChangedAccountSet -Limit 5000
    Write-Info ("ib_changed_accounts loaded: {0} account(s) on delivery block list" -f $ibChangedSet.Count)

    $batchTargets = New-Object System.Collections.Generic.List[psobject]
    foreach ($r in $compileReadyRows) {
        if ($batchTargets.Count -ge $MaxBatch) { break }
        $rNorm = Normalize-AccountId ([string]$r.account_number)
        if ($rNorm -and $ibChangedSet.ContainsKey($rNorm)) {
            Write-Warn2 ("IB-CHANGED BLOCK: account {0} is on ib_changed_accounts list -> flipping status to 'ib_changed' (no compile, no email)." -f $rNorm)
            try {
                [void](Update-RequestStatus -Id ([string]$r.id) -NewStatus 'ib_changed' `
                         -AllowedFromStatuses @($STATUS_COMPILE_READY,$STATUS_MATCHED,$STATUS_APPROVED,$STATUS_COMPILED,$STATUS_COMPILING))
                $stat_ibChangedBlocked++
            } catch {
                Write-Warn2 ("IB-Changed status flip failed for id={0}: {1}" -f $r.id, $_.Exception.Message)
            }
            continue
        }
        if (-not $ForceResend) {
            if (Test-AlreadyApproved -ApprovedCsv $paths.ApprovedCsv -Account $r.account_number -Broker $r.broker_name) {
                Write-Info "Skipping already-approved row: $($r.account_number) / $($r.broker_name)"
                continue
            }
        }
        [void]$batchTargets.Add($r)
    }
    # Compiled retries — only those whose ZIP still exists (otherwise need fresh compile).
    $emailRetryTargets = New-Object System.Collections.Generic.List[psobject]
    foreach ($r in $compiledRetryRows) {
        if ($emailRetryTargets.Count + $batchTargets.Count -ge $MaxBatch) { break }
        # Phase 16.5 PART C — also block IB-Changed accounts in the email-retry path.
        $rNorm = Normalize-AccountId ([string]$r.account_number)
        if ($rNorm -and $ibChangedSet.ContainsKey($rNorm)) {
            Write-Warn2 ("IB-CHANGED BLOCK (retry path): account {0} -> flipping to 'ib_changed' (no email)." -f $rNorm)
            try {
                [void](Update-RequestStatus -Id ([string]$r.id) -NewStatus 'ib_changed' `
                         -AllowedFromStatuses @($STATUS_COMPILED,$STATUS_COMPILE_READY,$STATUS_MATCHED,$STATUS_APPROVED,$STATUS_COMPILING))
                $stat_ibChangedBlocked++
            } catch { Write-Warn2 ("IB-Changed status flip (retry) failed for id={0}: {1}" -f $r.id, $_.Exception.Message) }
            continue
        }
        $bundleName = Get-BundleBaseName $r.broker_name $r.account_number
        $zip        = Join-Path $paths.ReadyDir ($bundleName + '.zip')
        if (Test-Path -LiteralPath $zip -PathType Leaf) {
            [void]$emailRetryTargets.Add($r)
        }
    }
    Write-Ok ("After dedup + IB-Changed block + batch cap: full pipeline = {0}, email-only retry = {1}, ib_changed blocked = {2}" -f $batchTargets.Count, $emailRetryTargets.Count, $stat_ibChangedBlocked)

    # ── 5. STAGE + INJECT for each batch target ────────────────────────────
    $stagedSummary = New-Object System.Collections.Generic.List[psobject]
    if ($batchTargets.Count -gt 0) {
        Write-Step "Staging $($batchTargets.Count) MQ5 file(s) into COMPILE_WORK..."
        foreach ($r in $batchTargets) {
            if ($r.account_number -notmatch '^[0-9]+$') { Write-Warn2 "Skipping row (non-numeric account '$($r.account_number)') id=$($r.id)"; continue }
            # ENTERPRISE CONTRACT: broker_name is informational only. Orchestration's primary
            # identity is account_number. If broker is missing, fall back to 'UNKNOWNBROKER' so
            # the hardened worker scripts (which require a non-empty broker arg) keep running.
            # The original raw $r.broker_name is still passed to emails / CSVs unchanged.
            $safeBroker      = Get-SafeBroker $r.broker_name
            $brokerForWorker = if ([string]::IsNullOrWhiteSpace([string]$r.broker_name)) { 'UNKNOWNBROKER' } else { $r.broker_name }
            if ($safeBroker -eq 'UNKNOWNBROKER') {
                Write-Info ("Row id={0} account={1}: broker_name missing -> using fallback label '{2}' (informational only, NOT used for matching)." -f $r.id, $r.account_number, $brokerForWorker)
            }

            $prep = Invoke-PrepareCompile -ScriptPath $paths.PrepareCompileScript -AccountNumber $r.account_number -Broker $brokerForWorker -Root $Root
            if ($prep.ExitCode -ne 0) {
                Write-Err2 ("prepare_compile failed for {0} ({1}): exit {2}" -f $r.account_number, $r.broker_name, $prep.ExitCode)
                [void]$stagedSummary.Add([pscustomobject]@{ Row = $r; Staged = $false; Reason = "prepare_compile exit $($prep.ExitCode)" })
                continue
            }
            $bundleBase = Get-BundleBaseName $r.broker_name $r.account_number
            $mq5Path    = Join-Path $paths.WorkDir ($bundleBase + '.mq5')
            try {
                $inj = Set-Mq5AccountNumber -Mq5Path $mq5Path -AccountNumber $r.account_number -Placeholder $AccountPlaceholder
                Write-Info $inj.Note
            } catch {
                Write-Warn2 "Account injection failed for $($r.account_number): $($_.Exception.Message)"
            }
            [void]$stagedSummary.Add([pscustomobject]@{ Row = $r; Staged = $true; BundleBase = $bundleBase; Mq5Path = $mq5Path })
        }
        $stagedOk = @($stagedSummary | Where-Object Staged).Count
        Write-Ok "$stagedOk MQ5 file(s) staged + injected."
    }

    # ── 6. Batch compile (single sub-process call) ────────────────────────
    Write-Info ("Phase 6 staging-check: stagedSummary holds $($stagedSummary.Count) total item(s), $($stagedOk) flagged Staged=true.")
    if (@($stagedSummary | Where-Object Staged).Count -gt 0) {
        Write-Info ("compile_queue_engine subprocess starting at $(Get-Date -Format 'HH:mm:ss.fff')")
        Write-Step 'Invoking compile_queue_engine.ps1 (batch)...'
        $cmp = Invoke-CompileQueue -ScriptPath $paths.CompileQueueScript -Root $Root -DryRun:$DryRun
        Write-Info ("compile_queue_engine exit: {0}" -f $cmp.ExitCode)
        Write-Info ("compile_queue_engine subprocess returned at $(Get-Date -Format 'HH:mm:ss.fff')")
    } else {
        Write-Info 'No fresh MQ5 to compile this run.'
    }

    # ── 7. Per-row delivery loop ──────────────────────────────────────────
    # Combine fresh-batch (must check EX5 exists) + email-retry rows.
    $deliveryTargets = @()
    foreach ($s in $stagedSummary) {
        if (-not $s.Staged) { continue }
        $ex5 = Join-Path $paths.CompiledDir ($s.BundleBase + '.ex5')
        if (Test-Path -LiteralPath $ex5 -PathType Leaf) {
            $deliveryTargets += [pscustomobject]@{ Row = $s.Row; BundleBase = $s.BundleBase; Ex5 = $ex5; Source = 'fresh' }
        } else {
            Write-Err2 "Compile failed for $($s.BundleBase) — EX5 missing in COMPILED_EX5."
            # Append to all_clients.csv with failure marker.
            Add-CsvRow -Path $paths.AllCsv -Row ([pscustomobject]@{
                email           = $s.Row.email
                account_number  = $s.Row.account_number
                broker          = $s.Row.broker_name
                status          = 'compile_failed'
                last_touched_at = (Get-Date).ToString('o')
                last_event      = 'compile_failed'
                supabase_id     = $s.Row.id
            })
        }
    }
    foreach ($r in $emailRetryTargets) {
        $bb  = Get-BundleBaseName $r.broker_name $r.account_number
        $ex5 = Join-Path $paths.CompiledDir ($bb + '.ex5')
        if (Test-Path -LiteralPath $ex5 -PathType Leaf) {
            $deliveryTargets += [pscustomobject]@{ Row = $r; BundleBase = $bb; Ex5 = $ex5; Source = 'retry' }
        }
    }

    if ($deliveryTargets.Count -eq 0 -and $rejectedRows.Count -eq 0) {
        Write-Info 'Nothing to deliver and no rejections to email this run.'
    }

    # Resolve SMTP NetworkCredential once for the whole batch.
    $smtpNetCred = $null
    if (-not $DryRun) { $smtpNetCred = $smtpCred.GetNetworkCredential() }

    $stat_success           = 0
    $stat_emailFailed       = 0
    $stat_safetyAbort       = 0
    $stat_rejectSent        = 0
    $stat_rejectSkip        = 0
    $stat_outboxSent        = 0   # Phase 15.5A — email_outbox sent count
    $stat_outboxFailed      = 0   # Phase 15.5A — email_outbox failed count
    $stat_outboxSkippedDry  = 0   # Phase 15.5A — outbox dry-run skips
    $stat_outboxClaimSkip   = 0   # Phase 15.5A — already claimed by another instance

    foreach ($t in $deliveryTargets) {
        $r          = $t.Row
        $bundleBase = $t.BundleBase
        $ex5        = $t.Ex5

        Write-Step "Building delivery bundle for $bundleBase ..."
        # ENTERPRISE CONTRACT: broker_name informational only. Fall back if missing so
        # create_delivery_bundle.ps1 (which requires a non-empty broker arg) keeps working.
        $brokerForWorker = if ([string]::IsNullOrWhiteSpace([string]$r.broker_name)) { 'UNKNOWNBROKER' } else { $r.broker_name }
        $bnd = Invoke-CreateDeliveryBundle -ScriptPath $paths.CreateBundleScript -AccountNumber $r.account_number -Broker $brokerForWorker -Root $Root
        if ($bnd.ExitCode -ne 0) {
            Write-Err2 "create_delivery_bundle failed for $bundleBase (exit $($bnd.ExitCode))."
            $stat_safetyAbort++
            continue
        }
        $zip = Join-Path $paths.ReadyDir ($bundleBase + '.zip')

        # Defence in depth — re-scan the ZIP even though create_delivery_bundle did.
        $check = Test-ZipSafeForDelivery -ZipPath $zip
        if (-not $check.Ok) {
            Write-Err2 "SAFETY ABORT: $($check.Reason)"
            $stat_safetyAbort++
            continue
        }
        Write-Ok ("ZIP clean ({0} entries, {1} EX5)." -f $check.EntryCount, $check.Ex5Count)

        # Load manifest (if present) so we can include SHA256 in the email.
        $hash = ''
        $manifestPath = Join-Path $paths.ManifestsDir ($bundleBase + '.json')
        if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
            try {
                $m = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
                if ($m -and $m.sha256) { $hash = $m.sha256 }
            } catch { Write-Warn2 "Could not parse manifest: $($_.Exception.Message)" }
        }

        # Merge placeholders (content + runtime) and render.
        $map = @{}
        foreach ($k in $successContent.Keys) { $map[$k] = $successContent[$k] }
        $map['ACCOUNT_NUMBER'] = $r.account_number
        $map['BROKER']         = $r.broker_name
        $map['EX5_FILENAME']   = ($bundleBase + '.ex5')
        $map['CLIENT_EMAIL']   = $r.email
        $map['DELIVERY_DATE']  = (Get-Date).ToString('yyyy-MM-dd HH:mm')
        $map['COMPILE_HASH']   = $(if ($hash) { $hash } else { 'n/a' })

        $renderedHtml    = Format-Template -Html $successHtml -Map $map
        $renderedSubject = Format-Template -Html $map['EMAIL_SUBJECT'] -Map $map

        if ($DryRun) {
            Write-Info "DRY-RUN: would email $($r.email) with subject: $renderedSubject"
            continue
        }

        Write-Step "Sending success email to $($r.email)..."
        try {
            Send-HtmlEmail -From $SenderEmail -FromName 'Z Trade University' `
                           -NetCredential $smtpNetCred `
                           -To $r.email -Subject $renderedSubject `
                           -HtmlBody $renderedHtml -AttachmentPath $zip
            Write-Ok "Email accepted by Gmail SMTP."
        } catch {
            Write-Err2 "SMTP send failed for $($r.email): $($_.Exception.Message)"
            $stat_emailFailed++
            # Best-effort: drop row to status=compiled so next run retries email-only.
            try {
                if ($t.Source -eq 'fresh') {
                    [void](Update-RequestStatus -Id $r.id -NewStatus $STATUS_COMPILED -AllowedFromStatuses $READY_STATUSES_QUERY)
                }
            } catch { Write-Warn2 "Could not flip Supabase status to compiled: $($_.Exception.Message)" }
            continue
        }

        # Move ZIP → DELIVERED\YYYY-MM-DD\
        $dateBucket = Join-Path $paths.DeliveredDir (Get-Date -Format 'yyyy-MM-dd')
        if (-not (Test-Path -LiteralPath $dateBucket)) { New-Item -ItemType Directory -Path $dateBucket -Force -ErrorAction Stop | Out-Null }
        $delivered = Join-Path $dateBucket ($bundleBase + '.zip')
        if (Test-Path -LiteralPath $delivered) {
            $delivered = Join-Path $dateBucket ($bundleBase + '__resent_' + (Get-Date -Format 'HH-mm-ss') + '.zip')
        }
        try {
            Move-Item -LiteralPath $zip -Destination $delivered -ErrorAction Stop
            Write-Ok "Archived to $delivered"
        } catch {
            Write-Warn2 "Could not archive ZIP (manual move required): $($_.Exception.Message)"
        }

        # Flip Supabase status → emailed.
        try {
            [void](Update-RequestStatus -Id $r.id -NewStatus $STATUS_EMAILED -AllowedFromStatuses @($STATUS_COMPILE_READY,$STATUS_MATCHED,$STATUS_APPROVED,$STATUS_COMPILED,$STATUS_COMPILING))
            Write-Ok 'Supabase status flipped to "emailed".'
        } catch {
            Write-Warn2 "Supabase status update failed: $($_.Exception.Message)"
        }

        # Append to mailing lists.
        Add-CsvRow -Path $paths.ApprovedCsv -Row ([pscustomobject]@{
            email           = $r.email
            account_number  = $r.account_number
            broker          = $r.broker_name
            delivered_at    = (Get-Date).ToString('o')
            ex5_filename    = ($bundleBase + '.ex5')
            sha256          = $hash
            delivery_zip    = $delivered
            supabase_id     = $r.id
        })
        Add-CsvRow -Path $paths.AllCsv -Row ([pscustomobject]@{
            email           = $r.email
            account_number  = $r.account_number
            broker          = $r.broker_name
            status          = 'approved'
            last_touched_at = (Get-Date).ToString('o')
            last_event      = 'delivery_email_sent'
            supabase_id     = $r.id
        })
        $stat_success++
    }

    # ── 8. Rejection emails (mismatch branch) ─────────────────────────────
    foreach ($r in $rejectedRows) {
        if (Test-AlreadyRejected -RejectedCsv $paths.RejectedCsv -Account $r.account_number -Broker $r.broker_name -Email $r.email) {
            $stat_rejectSkip++
            continue
        }
        $map = @{}
        foreach ($k in $mismatchContent.Keys) { $map[$k] = $mismatchContent[$k] }
        $map['ACCOUNT_NUMBER']    = $r.account_number
        $map['BROKER']            = $r.broker_name
        $map['CLIENT_EMAIL']      = $r.email
        $map['REJECTION_REASON']  = 'Account not found in the latest broker partner report.'
        $map['REJECTION_DATE']    = (Get-Date).ToString('yyyy-MM-dd HH:mm')

        $renderedHtml    = Format-Template -Html $mismatchHtml -Map $map
        $renderedSubject = Format-Template -Html $map['EMAIL_SUBJECT'] -Map $map

        if ($DryRun) {
            Write-Info "DRY-RUN mismatch: would email $($r.email) subject: $renderedSubject"
            continue
        }

        Write-Step "Sending mismatch email to $($r.email)..."
        try {
            Send-HtmlEmail -From $SenderEmail -FromName 'Z Trade University' `
                           -NetCredential $smtpNetCred `
                           -To $r.email -Subject $renderedSubject `
                           -HtmlBody $renderedHtml
            Write-Ok 'Mismatch email accepted by Gmail SMTP.'
            $stat_rejectSent++
        } catch {
            Write-Err2 "Mismatch SMTP failed for $($r.email): $($_.Exception.Message)"
            continue
        }

        Add-CsvRow -Path $paths.RejectedCsv -Row ([pscustomobject]@{
            email          = $r.email
            account_number = $r.account_number
            broker         = $r.broker_name
            rejected_at    = (Get-Date).ToString('o')
            reason         = $map['REJECTION_REASON']
            supabase_id    = $r.id
        })
        Add-CsvRow -Path $paths.AllCsv -Row ([pscustomobject]@{
            email           = $r.email
            account_number  = $r.account_number
            broker          = $r.broker_name
            status          = 'rejected'
            last_touched_at = (Get-Date).ToString('o')
            last_event      = 'mismatch_email_sent'
            supabase_id     = $r.id
        })
    }

    # ── 2.6 Phase 16.5 PART A — Consume pending resend_requests ────────────
    # Dashboard RESEND button writes to resend_requests.  Here we re-send the
    # delivery email using the same success template + EX5 bundle that the
    # primary path uses.  Does NOT remove the original approved_clients.csv
    # row.  Bumps license_requests.resend_count + last_resend_at on success.
    # Numbered 2.6 historically (queue is consumed late so $smtpNetCred is
    # already resolved); placement here keeps the rest of the engine flow
    # untouched.
    $stat_resendSent    = 0
    $stat_resendFailed  = 0
    $stat_resendSkipped = 0
    try {
        Write-Step 'Phase 16.5 — draining resend_requests (pending -> consumed/failed)...'
        $resendRows = @(Get-PendingResendRequests -Limit 100)
        Write-Ok ("resend_requests pending rows fetched: {0}" -f $resendRows.Count)

        foreach ($rr in $resendRows) {
            $rrId      = [string]$rr.id
            $licId     = [string]$rr.license_request_id
            $rrAccount = [string]$rr.account_number
            $rrEmail   = [string]$rr.recipient_email

            # Atomic claim — PATCH status='processing' only if still 'pending'.
            $claim = Update-ResendRequestStatus -Id $rrId -NewStatus 'processing' -RequireCurrentStatus 'pending'
            if (-not $claim) {
                Write-Warn2 ("Resend #{0} claim failed (already taken?); skipping" -f $rrId)
                $stat_resendSkipped++
                continue
            }

            # Fetch the underlying license_request row for full context.
            $licRow = $null
            if ($licId) { $licRow = Get-LicenseRequestById -Id $licId }
            if (-not $licRow) {
                Write-Warn2 ("Resend #{0}: license_requests row not found (id={1}); marking failed" -f $rrId, $licId)
                [void](Update-ResendRequestStatus -Id $rrId -NewStatus 'failed')
                $stat_resendFailed++
                continue
            }

            $broker = if ([string]::IsNullOrWhiteSpace([string]$licRow.broker_name)) { 'UNKNOWNBROKER' } else { [string]$licRow.broker_name }
            $bundleBase = Get-BundleBaseName $broker $licRow.account_number

            if ($DryRun) {
                Write-Info ("DRY-RUN resend: would re-deliver {0}.ex5 to {1}" -f $bundleBase, $rrEmail)
                [void](Update-ResendRequestStatus -Id $rrId -NewStatus 'consumed')
                $stat_resendSkipped++
                continue
            }

            # Build fresh delivery ZIP (re-compile if necessary).
            $ex5 = Join-Path $paths.CompiledDir ($bundleBase + '.ex5')
            if (-not (Test-Path -LiteralPath $ex5 -PathType Leaf)) {
                Write-Warn2 ("Resend #{0}: EX5 missing at {1} — needs a fresh compile cycle; marking failed." -f $rrId, $ex5)
                [void](Update-ResendRequestStatus -Id $rrId -NewStatus 'failed')
                $stat_resendFailed++
                continue
            }

            $bnd = Invoke-CreateDeliveryBundle -ScriptPath $paths.CreateBundleScript -AccountNumber $licRow.account_number -Broker $broker -Root $Root
            if ($bnd.ExitCode -ne 0) {
                Write-Err2 ("Resend #{0}: create_delivery_bundle failed (exit {1})." -f $rrId, $bnd.ExitCode)
                [void](Update-ResendRequestStatus -Id $rrId -NewStatus 'failed')
                $stat_resendFailed++
                continue
            }
            $zip = Join-Path $paths.ReadyDir ($bundleBase + '.zip')

            $check = Test-ZipSafeForDelivery -ZipPath $zip
            if (-not $check.Ok) {
                Write-Err2 ("Resend #{0}: SAFETY ABORT — {1}" -f $rrId, $check.Reason)
                [void](Update-ResendRequestStatus -Id $rrId -NewStatus 'failed')
                $stat_resendFailed++
                continue
            }

            $hash = ''
            $manifestPath = Join-Path $paths.ManifestsDir ($bundleBase + '.json')
            if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
                try {
                    $m = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
                    if ($m -and $m.sha256) { $hash = $m.sha256 }
                } catch {}
            }

            $map = @{}
            foreach ($k in $successContent.Keys) { $map[$k] = $successContent[$k] }
            $map['ACCOUNT_NUMBER'] = [string]$licRow.account_number
            $map['BROKER']         = [string]$licRow.broker_name
            $map['EX5_FILENAME']   = ($bundleBase + '.ex5')
            $map['CLIENT_EMAIL']   = if ($rrEmail) { $rrEmail } else { [string]$licRow.email }
            $map['DELIVERY_DATE']  = (Get-Date).ToString('yyyy-MM-dd HH:mm')
            $map['COMPILE_HASH']   = $(if ($hash) { $hash } else { 'n/a' })

            $renderedHtml    = Format-Template -Html $successHtml -Map $map
            $renderedSubject = Format-Template -Html $map['EMAIL_SUBJECT'] -Map $map

            $finalRecipient = if ($rrEmail) { $rrEmail } else { [string]$licRow.email }

            try {
                Send-HtmlEmail -From $SenderEmail -FromName 'Z Trade University' `
                               -NetCredential $smtpNetCred `
                               -To $finalRecipient -Subject $renderedSubject `
                               -HtmlBody $renderedHtml -AttachmentPath $zip
                Write-Host ("[RESEND] account {0} resent successfully -> {1}" -f $rrAccount, $finalRecipient) -ForegroundColor Cyan
                $stat_resendSent++
            } catch {
                Write-Err2 ("[RESEND] account {0} FAILED -> {1}: {2}" -f $rrAccount, $finalRecipient, $_.Exception.Message)
                [void](Update-ResendRequestStatus -Id $rrId -NewStatus 'failed')
                $stat_resendFailed++
                continue
            }

            # Move ZIP -> DELIVERED\YYYY-MM-DD\ as a resend artifact (don't clobber original).
            $dateBucket = Join-Path $paths.DeliveredDir (Get-Date -Format 'yyyy-MM-dd')
            if (-not (Test-Path -LiteralPath $dateBucket)) { New-Item -ItemType Directory -Path $dateBucket -Force -ErrorAction Stop | Out-Null }
            $delivered = Join-Path $dateBucket ($bundleBase + '__resend_' + (Get-Date -Format 'HH-mm-ss') + '.zip')
            try { Move-Item -LiteralPath $zip -Destination $delivered -ErrorAction Stop } catch {}

            # Mark resend_requests row consumed.
            [void](Update-ResendRequestStatus -Id $rrId -NewStatus 'consumed')

            # Bump license_requests.resend_count + last_resend_at (best-effort).
            try {
                $cur = Get-LicenseRequestResendCount -Id $licId
                $newCount = ($cur + 1)
                $patchUri = $script:SupabaseUrl.TrimEnd('/') + '/rest/v1/' + $script:Table + '?id=eq.' + $licId
                $hdrs = @{
                    'apikey'=$script:SupabaseAuthKey; 'Authorization'='Bearer '+$script:SupabaseAuthKey
                    'Content-Type'='application/json'; 'Prefer'='return=minimal'
                }
                $body = (@{ resend_count = $newCount; last_resend_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } | ConvertTo-Json -Compress)
                [void](Invoke-WebRequest -Uri $patchUri -Method PATCH -Headers $hdrs -Body $body -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop)
            } catch {
                Write-Warn2 ("Resend #{0}: counter bump failed (non-fatal): {1}" -f $rrId, $_.Exception.Message)
            }
        }
    } catch {
        Write-Warn2 ("Phase 16.5 PART A resend step failed (non-fatal): {0}" -f $_.Exception.Message)
    }

    # ── 8.5 Phase 15.5A: drain Supabase email_outbox ───────────────────────
    # The dashboard inserts rows into email_outbox for matched/waiting/
    # not_found approval messages.  Here we drain pending rows via the
    # same Gmail SMTP path that just sent the delivery + mismatch emails.
    # Safe to run alongside the legacy paths above — different templates,
    # different recipients in most cases.
    if (-not $SkipOutbox) {
        Write-Step 'Draining email_outbox (pending -> sent/failed)...'
        $outboxRows = @()
        try {
            $outboxRows = @(Get-EmailOutboxPending -Limit $MaxBatch)
        } catch {
            Write-Warn2 ("email_outbox query failed (table may not exist or RLS denial): {0}" -f $_.Exception.Message)
            $outboxRows = @()
        }
        Write-Ok ("email_outbox pending rows fetched: {0}" -f $outboxRows.Count)

        foreach ($row in $outboxRows) {
            $rowId = [string]$row.id

            # 1. Atomic claim — PATCH status='sending' only if still 'pending'.
            #    Phase 15.5C: helper now returns @{ ok; affected; statusCode; errorBody }.
            $claim = Update-EmailOutboxStatus -Id $rowId `
                       -NewStatus 'sending' -RequireCurrentStatus 'pending'

            if (-not $claim.ok) {
                Write-Warn2 ("Claim failed for outbox #{0} (HTTP {1}): {2}" -f $rowId, $claim.statusCode, $claim.errorMessage)
                if ($claim.errorBody) { Write-Warn2 ("  PostgREST body: " + $claim.errorBody) }
                continue
            }
            if ($claim.affected -eq 0) {
                Write-Info ("Outbox row #{0} already claimed (or RLS filtered) — skipping." -f $rowId)
                $stat_outboxClaimSkip++
                continue
            }

            # 2. DryRun: roll the claim back so a real run can pick it up.
            if ($DryRun) {
                Write-Info ("DRY-RUN: would send outbox #{0} ({1}) -> {2}" -f $rowId, $row.template_type, $row.recipient_email)
                [void](Update-EmailOutboxStatus -Id $rowId -NewStatus 'pending' `
                        -RequireCurrentStatus 'sending')
                $stat_outboxSkippedDry++
                continue
            }

            # 3. Real send via existing Send-HtmlEmail (no attachment for outbox)
            $subject  = if ($row.subject)   { [string]$row.subject }   else { '(no subject)' }
            $htmlBody = if ($row.body_html) { [string]$row.body_html } else { '' }
            try {
                Send-HtmlEmail -From $SenderEmail -FromName 'Z Trade University' `
                               -NetCredential $smtpNetCred `
                               -To $row.recipient_email `
                               -Subject $subject `
                               -HtmlBody $htmlBody

                # 4. Mark sent — guarded by RequireCurrentStatus='sending'
                $sentAtIso = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
                $markSent = Update-EmailOutboxStatus -Id $rowId -NewStatus 'sent' `
                    -RequireCurrentStatus 'sending' `
                    -ExtraFields @{
                        sent_at         = $sentAtIso
                        delivery_status = 'smtp_sent'
                        error_message   = $null
                    }
                if ($markSent.ok) {
                    Write-Ok ("Outbox sent: #{0} -> {1} ({2})" -f $rowId, $row.recipient_email, $row.template_type)
                    $stat_outboxSent++
                } else {
                    # Email DID go out, but DB writeback failed — record loudly and continue.
                    Write-Err2 ("Outbox #{0}: email sent but mark-sent failed (HTTP {1}): {2}" -f $rowId, $markSent.statusCode, $markSent.errorMessage)
                    if ($markSent.errorBody) { Write-Err2 ("  PostgREST body: " + $markSent.errorBody) }
                    $stat_outboxSent++   # email was actually sent; admin will see row stuck in 'sending'
                }
            } catch {
                $errText = $_.Exception.Message
                $markFailed = Update-EmailOutboxStatus -Id $rowId -NewStatus 'failed' `
                    -RequireCurrentStatus 'sending' `
                    -ExtraFields @{
                        delivery_status = 'smtp_failed'
                        error_message   = $errText
                    }
                if (-not $markFailed.ok) {
                    Write-Warn2 ("Could not mark outbox failed for #{0} (HTTP {1}): {2}" -f $rowId, $markFailed.statusCode, $markFailed.errorMessage)
                }
                Write-Err2 ("Outbox send failed for {0}: {1}" -f $row.recipient_email, $errText)
                $stat_outboxFailed++
            }
        }
    } else {
        Write-Info '-SkipOutbox specified — email_outbox drain bypassed.'
    }

    # Clear SMTP credential reference.
    $smtpNetCred = $null

    # ── 9. Summary + persistent log ───────────────────────────────────────
    $finishedAt = Get-Date
    Write-Host ''
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host '|   RUN SUMMARY                                        |' -ForegroundColor DarkYellow
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host ('   Processed (fresh)         : {0}' -f $batchTargets.Count)
    Write-Host ('   Processed (email retry)   : {0}' -f $emailRetryTargets.Count)
    Write-Host ('   Delivery emails sent      : {0}' -f $stat_success) -ForegroundColor Green
    Write-Host ('   Delivery emails failed    : {0}' -f $stat_emailFailed) -ForegroundColor $(if ($stat_emailFailed) {'Red'} else {'Green'})
    Write-Host ('   Safety aborts             : {0}' -f $stat_safetyAbort) -ForegroundColor $(if ($stat_safetyAbort) {'Red'} else {'Green'})
    Write-Host ('   Mismatch emails sent      : {0}' -f $stat_rejectSent)
    Write-Host ('   Mismatch skipped (dedup)  : {0}' -f $stat_rejectSkip)
    Write-Host ('   Phase 16 auto-matched     : {0}' -f $stat_autoMatched)         -ForegroundColor Cyan
    Write-Host ('   IB-Changed blocked        : {0}' -f $stat_ibChangedBlocked)    -ForegroundColor $(if ($stat_ibChangedBlocked) {'Yellow'} else {'Gray'})
    Write-Host ('   Resends sent              : {0}' -f $stat_resendSent)          -ForegroundColor Cyan
    Write-Host ('   Resends failed            : {0}' -f $stat_resendFailed)        -ForegroundColor $(if ($stat_resendFailed) {'Red'} else {'Green'})
    Write-Host ('   Resends skipped/dry-run   : {0}' -f $stat_resendSkipped)
    Write-Host ('   Outbox emails sent        : {0}' -f $stat_outboxSent)          -ForegroundColor Green
    Write-Host ('   Outbox emails failed      : {0}' -f $stat_outboxFailed)        -ForegroundColor $(if ($stat_outboxFailed) {'Red'} else {'Green'})
    Write-Host ('   Outbox claim-skipped      : {0}' -f $stat_outboxClaimSkip)
    Write-Host ('   Outbox skipped (dry-run)  : {0}' -f $stat_outboxSkippedDry)
    Write-Host ('   Duration                  : {0:N1}s' -f ($finishedAt - $startedAt).TotalSeconds)
    Write-Host ''

    # Persist text log
    $stamp   = $startedAt.ToString('yyyy-MM-dd_HH-mm-ss')
    $logFile = Join-Path $paths.LogsDir ("master_engine_$stamp.log")
    $script:LogLines | Set-Content -LiteralPath $logFile -Encoding utf8

    # Persist structured snapshot
    $summary = [pscustomobject]@{
        started_at            = $startedAt.ToString('o')
        finished_at           = $finishedAt.ToString('o')
        processed_count       = ($batchTargets.Count + $emailRetryTargets.Count)
        success_count         = $stat_success
        failed_compile_count  = @($stagedSummary | Where-Object { -not $_.Staged }).Count
        failed_email_count    = $stat_emailFailed
        safety_aborts         = $stat_safetyAbort
        rejection_emails_sent = $stat_rejectSent
        rejection_skipped     = $stat_rejectSkip
        auto_matched          = $stat_autoMatched            # Phase 16
        ib_changed_blocked    = $stat_ibChangedBlocked      # Phase 16.5 PART C
        resend_sent           = $stat_resendSent            # Phase 16.5 PART A
        resend_failed         = $stat_resendFailed          # Phase 16.5 PART A
        resend_skipped        = $stat_resendSkipped         # Phase 16.5 PART A
        outbox_sent           = $stat_outboxSent            # Phase 15.5A
        outbox_failed         = $stat_outboxFailed          # Phase 15.5A
        outbox_claim_skipped  = $stat_outboxClaimSkip       # Phase 15.5A
        outbox_skipped_dry    = $stat_outboxSkippedDry      # Phase 15.5A
        dry_run               = [bool]$DryRun
        host                  = $env:COMPUTERNAME
        user                  = $env:USERNAME
    }
    $summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $paths.LogsDir 'master_engine_last_run.json') -Encoding utf8
    Add-Content -LiteralPath (Join-Path $paths.LogsDir 'master_engine_history.jsonl') -Value ($summary | ConvertTo-Json -Depth 6 -Compress) -Encoding utf8

    Write-Info "Log: $logFile"
    exit 0

} catch {
    Write-Host ''
    Write-Err2 "Unexpected error: $($_.Exception.Message)"
    if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) {
        Write-Info "At line $($_.InvocationInfo.ScriptLineNumber)"
    }
    exit 99
}

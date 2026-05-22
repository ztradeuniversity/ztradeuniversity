<#
.SYNOPSIS
    ZTU delivery-email sender + client-registry builder.

.DESCRIPTION
    Production-grade local script that:
      1. Locates a pre-built delivery ZIP in READY_TO_SEND
      2. Runs a multi-layer security gauntlet on the ZIP
      3. Sends the ZIP to the client via Gmail SMTP (STARTTLS, port 587)
      4. Moves the delivered ZIP into DELIVERED\YYYY-MM-DD\
      5. Inserts/updates a row in CLIENT_DATABASE\clients_registry.csv
         (dedup-keyed by account_number + broker, status = active_client)

    This script is the LAST step of the manual delivery pipeline. It is
    designed so a future VPS-based mailer can replace the SMTP call without
    touching any other logic — the registry, security gauntlet, and folder
    moves are independent of the transport.

    DESIGN GOALS
      * Beginner-friendly:  step-by-step coloured logging
      * Production-safe:    multiple independent guards before SMTP
      * CRM-ready:          registry schema is forward-compatible
      * Idempotent-ish:     re-sending the same account/broker pair updates
                            its registry row rather than duplicating it

    WHAT THIS SCRIPT DELIBERATELY DOES NOT DO
      * No website file is modified
      * No Supabase call is made
      * No MetaEditor / MT5 automation is attempted
      * No MQ5 source file is ever read, copied, or transmitted
      * No silent failures — every error path prints + exits non-zero

.PARAMETER AccountNumber
    The MT5 account number (digits only).

.PARAMETER Broker
    The broker name (e.g., Exness, HFM, IC Markets). Non-alphanumeric
    characters are stripped during filename resolution so the script
    can find the matching ZIP in READY_TO_SEND\.

.PARAMETER Recipient
    The client's email address. Will receive the EX5 ZIP + install
    instructions.

.PARAMETER SenderEmail
    The Gmail address that will send the email. This is also used as
    the SMTP authentication username.

.PARAMETER AppPassword
    A Gmail app password (16-char string) for the sender account.
    REQUIRES that 2-Step Verification be enabled on the Gmail account
    and an App Password be generated at:
      https://myaccount.google.com/apppasswords
    Passed as a SecureString so the value never appears in plain text
    in PowerShell history or in the process list.

.PARAMETER Root
    Root of the ZTU automation tree. Defaults to D:\ZTU_AUTOMATION.

.PARAMETER MaxAttachmentMB
    Hard upper bound on the ZIP attachment size (megabytes). Default 25
    matches Gmail's standard attachment cap. Lowering this is fine; the
    script refuses any value > 25.

.EXAMPLE
    .\send_delivery_email.ps1
    # Fully interactive — prompts for every field, including the app password
    # (which is read invisibly).

.EXAMPLE
    .\send_delivery_email.ps1 -AccountNumber 168095416 -Broker Exness `
        -Recipient client@example.com -SenderEmail ops@ztradeuniversity.com

    # Will still prompt for the app password (intentionally — never on the
    # command line).

.NOTES
    Exit codes
       0   Success — email sent, ZIP moved, registry updated
       1   Invalid input (missing field, malformed email, bad broker, etc.)
       2   Required folder or ZIP missing
       3   ZIP failed pre-flight validation (empty / oversized / unreadable)
       4   Security guard tripped (MQ5 inside ZIP, unsafe path, no EX5 found)
       5   SMTP send failed (auth, network, attachment too large, etc.)
       6   Client registry write failed (file locked? open in Excel?)
       7   Move-to-DELIVERED failed (permissions / disk full)
      99   Unexpected error (full message + line number printed)
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false, Position = 0)]
    [string]$AccountNumber,

    [Parameter(Mandatory = $false, Position = 1)]
    [string]$Broker,

    [Parameter(Mandatory = $false, Position = 2)]
    [string]$Recipient,

    [Parameter(Mandatory = $false)]
    [string]$SenderEmail,

    [Parameter(Mandatory = $false)]
    [System.Security.SecureString]$AppPassword,

    [Parameter(Mandatory = $false)]
    [string]$Root = 'D:\ZTU_AUTOMATION',

    [Parameter(Mandatory = $false)]
    [int]$MaxAttachmentMB = 25
)

$ErrorActionPreference = 'Stop'

# ═══════════════════════════════════════════════════════════════════════════
#  Output helpers — keep the four prefixes the spec asked for.
# ═══════════════════════════════════════════════════════════════════════════
function Write-Step  ([string]$msg) { Write-Host '[STEP]  ' -ForegroundColor Cyan      -NoNewline; Write-Host $msg }
function Write-Ok    ([string]$msg) { Write-Host '[OK]    ' -ForegroundColor Green     -NoNewline; Write-Host $msg }
function Write-Info  ([string]$msg) { Write-Host '[INFO]  ' -ForegroundColor DarkGray  -NoNewline; Write-Host $msg -ForegroundColor DarkGray }
function Write-Err2  ([string]$msg) { Write-Host '[ERROR] ' -ForegroundColor Red       -NoNewline; Write-Host $msg -ForegroundColor Red }
function Write-Warn2 ([string]$msg) { Write-Host '[WARN]  ' -ForegroundColor Yellow    -NoNewline; Write-Host $msg -ForegroundColor Yellow }

# ═══════════════════════════════════════════════════════════════════════════
#  Email-format validator — same regex used on the public license-request form.
# ═══════════════════════════════════════════════════════════════════════════
function Test-EmailShape([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return $false }
    return [regex]::IsMatch($value, '^[^\s@]+@[^\s@]+\.[^\s@]+$')
}

# ═══════════════════════════════════════════════════════════════════════════
#  SecureString → plaintext extractor.
#  Used ONLY for the brief moment the SMTP call needs credentials.
#  We wipe the BSTR immediately after use.
# ═══════════════════════════════════════════════════════════════════════════
function ConvertFrom-SecureToPlain([System.Security.SecureString]$secure) {
    if ($null -eq $secure) { return $null }
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

# ═══════════════════════════════════════════════════════════════════════════
#  Top-level error guard. Anything not caught by an inner try lands here.
# ═══════════════════════════════════════════════════════════════════════════
try {

    # ───────────────────────────────────────────────────────────────────────
    #  STEP A — Collect missing inputs interactively.
    #  AppPassword is prompted with -AsSecureString so it never echoes.
    # ───────────────────────────────────────────────────────────────────────
    if (-not $AccountNumber) { $AccountNumber = Read-Host 'Recipient MT5 account number' }
    if (-not $Broker)        { $Broker        = Read-Host 'Broker name (e.g., Exness)' }
    if (-not $Recipient)     { $Recipient     = Read-Host 'Recipient email address' }
    if (-not $SenderEmail)   { $SenderEmail   = Read-Host 'Sender Gmail address (your support inbox)' }
    if (-not $AppPassword)   { $AppPassword   = Read-Host 'Gmail app password (16-char, NOT your main password)' -AsSecureString }

    $AccountNumber = $AccountNumber.Trim()
    $Broker        = $Broker.Trim()
    $Recipient     = $Recipient.Trim()
    $SenderEmail   = $SenderEmail.Trim()

    # ───────────────────────────────────────────────────────────────────────
    #  STEP B — Validate every field BEFORE we touch the filesystem or SMTP.
    # ───────────────────────────────────────────────────────────────────────
    if ([string]::IsNullOrWhiteSpace($AccountNumber)) { Write-Err2 'Account number cannot be empty.';                                       exit 1 }
    if ($AccountNumber -notmatch '^[0-9]+$')          { Write-Err2 "Account number must be digits only. Got: '$AccountNumber'";            exit 1 }
    if ([string]::IsNullOrWhiteSpace($Broker))        { Write-Err2 'Broker name cannot be empty.';                                         exit 1 }
    if (-not (Test-EmailShape $Recipient))            { Write-Err2 "Recipient email is malformed: '$Recipient'";                           exit 1 }
    if (-not (Test-EmailShape $SenderEmail))          { Write-Err2 "Sender Gmail address is malformed: '$SenderEmail'";                    exit 1 }
    if ($null -eq $AppPassword -or $AppPassword.Length -eq 0) { Write-Err2 'Gmail app password is required.';                              exit 1 }
    if ($MaxAttachmentMB -le 0 -or $MaxAttachmentMB -gt 25) {
        Write-Err2 "MaxAttachmentMB must be between 1 and 25 (Gmail cap). Got: $MaxAttachmentMB"
        exit 1
    }

    $SafeBroker = ($Broker -replace '[^a-zA-Z0-9]', '')
    if (-not $SafeBroker) { Write-Err2 "Broker name has no usable characters: '$Broker'"; exit 1 }

    # ───────────────────────────────────────────────────────────────────────
    #  STEP C — Resolve every path the script will touch.
    # ───────────────────────────────────────────────────────────────────────
    $ReadyDir       = Join-Path $Root 'READY_TO_SEND'
    $DeliveredRoot  = Join-Path $Root 'DELIVERED'
    $RegistryDir    = Join-Path $Root 'CLIENT_DATABASE'
    $RegistryFile   = Join-Path $RegistryDir 'clients_registry.csv'

    $BundleName     = "ZTU_${SafeBroker}_${AccountNumber}"
    $ZipFileName    = "${BundleName}.zip"
    $ZipPath        = Join-Path $ReadyDir $ZipFileName

    $DateStamp      = Get-Date -Format 'yyyy-MM-dd'
    $DateBucket     = Join-Path $DeliveredRoot $DateStamp
    $DeliveredZip   = Join-Path $DateBucket $ZipFileName

    # ───────────────────────────────────────────────────────────────────────
    #  Banner — beginner-friendly recap of what's about to happen.
    # ───────────────────────────────────────────────────────────────────────
    Write-Host ''
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host '|   ZTU Delivery Email Sender                          |' -ForegroundColor DarkYellow
    Write-Host '+======================================================+' -ForegroundColor DarkYellow
    Write-Host ''
    Write-Info "Recipient      : $Recipient"
    Write-Info "Account / brk  : $AccountNumber  /  $Broker  (file uses: $SafeBroker)"
    Write-Info "ZIP to send    : $ZipPath"
    Write-Info "Sender Gmail   : $SenderEmail"
    Write-Info "Max attachment : ${MaxAttachmentMB} MB"
    Write-Info "Will archive to: $DeliveredZip"
    Write-Info "Registry file  : $RegistryFile"
    Write-Host ''

    # ───────────────────────────────────────────────────────────────────────
    #  STEP 1 — Verify the READY_TO_SEND folder + ZIP exist on disk.
    # ───────────────────────────────────────────────────────────────────────
    Write-Step 'Verifying READY_TO_SEND folder + delivery ZIP...'
    if (-not (Test-Path -LiteralPath $ReadyDir -PathType Container)) {
        Write-Err2 "READY_TO_SEND folder is missing: $ReadyDir"
        exit 2
    }
    if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
        Write-Err2 "Delivery ZIP not found: $ZipPath"
        Write-Info  "Build it first with .\create_delivery_bundle.ps1 $AccountNumber $Broker"
        exit 2
    }
    Write-Ok "Found ZIP: $ZipPath"

    # ───────────────────────────────────────────────────────────────────────
    #  STEP 2 — Pre-flight ZIP validation:
    #    * non-empty
    #    * under the configured attachment cap
    #    * readable as a zip archive
    # ───────────────────────────────────────────────────────────────────────
    Write-Step 'Pre-flight ZIP size + readability checks...'
    $zipFI = Get-Item -LiteralPath $ZipPath
    if ($zipFI.Length -le 0) {
        Write-Err2 "ZIP is empty (0 bytes): $ZipPath"
        exit 3
    }
    $maxBytes = $MaxAttachmentMB * 1024 * 1024
    if ($zipFI.Length -gt $maxBytes) {
        Write-Err2 ("ZIP is too large: {0:N0} bytes > limit {1:N0} bytes ({2} MB)" -f $zipFI.Length, $maxBytes, $MaxAttachmentMB)
        Write-Info 'Gmail caps attachments at 25 MB. Trim the bundle or use a download link instead.'
        exit 3
    }
    Write-Ok ("ZIP size OK ({0:N0} bytes)" -f $zipFI.Length)

    # ───────────────────────────────────────────────────────────────────────
    #  STEP 3 — Security gauntlet (six independent checks inside one open).
    #
    #  CRITICAL: we never trust that create_delivery_bundle.ps1 was the
    #  thing that produced this ZIP. Re-verify everything here.
    #
    #    a) The file must open as a valid ZIP.
    #    b) Must contain >= 1 entry.
    #    c) No entry name may match /\.mq5$/i  -> MQ5 leak guard.
    #    d) No entry path may include ".." or start with "/" or "\"
    #       (path-traversal / absolute-path guard).
    #    e) Must contain >= 1 .ex5 entry (a delivery without an EX5
    #       is by definition broken).
    #    f) Total uncompressed size sanity-checks against the configured
    #       cap (compression-bomb mild guard).
    # ───────────────────────────────────────────────────────────────────────
    Write-Step 'Security gauntlet: inspecting every entry inside the ZIP...'
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
    $archive = $null
    try {
        $archive  = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
        $entries  = @($archive.Entries)
        if ($entries.Count -eq 0) {
            Write-Err2 'ZIP contains zero entries.'
            exit 3
        }

        # (c) MQ5 leak guard
        $mq5Hits = @($entries | Where-Object { $_.FullName -match '(?i)\.mq5$' })
        if ($mq5Hits.Count -gt 0) {
            Write-Err2 "MQ5 file(s) detected inside the ZIP. Refusing to send."
            foreach ($e in $mq5Hits) { Write-Err2 "   - $($e.FullName)" }
            exit 4
        }

        # (d) Path-traversal / absolute-path guard
        $badPath = @($entries | Where-Object {
            $n = $_.FullName
            ($n -match '\.\.') -or ($n -match '^[\\/]') -or ($n -match ':[\\/]')
        })
        if ($badPath.Count -gt 0) {
            Write-Err2 'Unsafe entry paths detected (path traversal / absolute / drive-letter). Refusing to send.'
            foreach ($e in $badPath) { Write-Err2 "   - $($e.FullName)" }
            exit 4
        }

        # (e) Must contain at least one EX5
        $ex5Hits = @($entries | Where-Object { $_.FullName -match '(?i)\.ex5$' })
        if ($ex5Hits.Count -eq 0) {
            Write-Err2 'ZIP does not contain any .ex5 file. Refusing to send.'
            exit 4
        }

        # (f) Sanity-cap on uncompressed bytes (10x the compressed cap)
        $totalUncompressed = ($entries | Measure-Object -Property Length -Sum).Sum
        $uncompressedCap   = ($MaxAttachmentMB * 1024 * 1024) * 10
        if ($totalUncompressed -gt $uncompressedCap) {
            Write-Err2 ("ZIP uncompressed size unreasonable: {0:N0} bytes (cap {1:N0}). Aborting." -f $totalUncompressed, $uncompressedCap)
            exit 4
        }

        Write-Ok ("ZIP clean — {0} entries, {1} EX5, 0 MQ5, no unsafe paths." -f $entries.Count, $ex5Hits.Count)
    } catch {
        Write-Err2 "Could not read the ZIP as an archive: $($_.Exception.Message)"
        exit 3
    } finally {
        if ($archive) { $archive.Dispose() }
    }

    # ───────────────────────────────────────────────────────────────────────
    #  STEP 4 — Build the MailMessage object (no SMTP traffic yet).
    #  Body content matches the spec verbatim. Encoded as UTF-8 so the
    #  arrow characters survive on every mail client.
    # ───────────────────────────────────────────────────────────────────────
    Write-Step 'Composing email...'
    $subject = 'Your Z Trade University EA File'
    $bodyLines = @(
        'Hello,',
        '',
        'Your EA package is attached.',
        '',
        'Installation:',
        '',
        '1. Extract ZIP',
        '2. Open MT5',
        [char]0x33 + '. File ' + [char]0x2192 + ' Open Data Folder',
        '4. MQL5 ' + [char]0x2192 + ' Experts',
        '5. Copy EX5 file',
        '6. Restart MT5',
        '7. Attach EA to chart',
        '8. Enable Algo Trading',
        '',
        'Support:',
        'ZTradeUniversity.com',
        '',
        'Thank you,',
        'Z Trade University'
    )
    # Fix step "3." — char(0x33) is '3', so the line above renders as
    # "3. File → Open Data Folder". Building it this way keeps the source
    # file itself ASCII-safe in case a copy/paste downstream re-encodes it.
    $body = ($bodyLines -join [Environment]::NewLine)

    $message = New-Object System.Net.Mail.MailMessage
    try {
        $message.From            = New-Object System.Net.Mail.MailAddress($SenderEmail, 'Z Trade University')
        $message.To.Add($Recipient) | Out-Null
        $message.Subject         = $subject
        $message.Body            = $body
        $message.IsBodyHtml      = $false
        $message.BodyEncoding    = [System.Text.Encoding]::UTF8
        $message.SubjectEncoding = [System.Text.Encoding]::UTF8

        $attachment = New-Object System.Net.Mail.Attachment($ZipPath)
        $attachment.Name = $ZipFileName
        $message.Attachments.Add($attachment) | Out-Null
        Write-Ok 'Message + attachment composed.'

        # ───────────────────────────────────────────────────────────────────
        #  STEP 5 — Send via Gmail SMTP (smtp.gmail.com:587, STARTTLS).
        #  The app password is decrypted from SecureString only for the
        #  duration of this call and never logged.
        # ───────────────────────────────────────────────────────────────────
        Write-Step 'Connecting to Gmail SMTP (smtp.gmail.com:587 + STARTTLS)...'
        $plain = $null
        $smtp  = $null
        try {
            $plain = ConvertFrom-SecureToPlain $AppPassword
            $smtp  = New-Object System.Net.Mail.SmtpClient('smtp.gmail.com', 587)
            $smtp.EnableSsl              = $true
            $smtp.DeliveryMethod         = [System.Net.Mail.SmtpDeliveryMethod]::Network
            $smtp.UseDefaultCredentials  = $false
            $smtp.Credentials            = New-Object System.Net.NetworkCredential($SenderEmail, $plain)
            $smtp.Timeout                = 60000  # 60 seconds

            $smtp.Send($message)
            Write-Ok "Email accepted by Gmail SMTP. Recipient: $Recipient"
        } catch {
            Write-Err2 "SMTP send failed: $($_.Exception.Message)"
            Write-Info  'Common causes:'
            Write-Info  '  - The app password is wrong or has been revoked.'
            Write-Info  '  - 2-Step Verification is not enabled on the sender Gmail.'
            Write-Info  '  - Gmail blocked the login as "suspicious" — check the sender inbox.'
            Write-Info  '  - The recipient address bounced (check the Gmail sender inbox for a bounce notification).'
            exit 5
        } finally {
            # Best-effort credential scrub.
            if ($plain) { $plain = $null }
            if ($smtp)  { $smtp.Dispose() }
        }
    } finally {
        # Dispose mail objects so the ZIP file lock is released BEFORE we move it.
        if ($message.Attachments.Count -gt 0) {
            foreach ($att in $message.Attachments) { $att.Dispose() }
        }
        $message.Dispose()
    }

    # ───────────────────────────────────────────────────────────────────────
    #  STEP 6 — Move the delivered ZIP into DELIVERED\YYYY-MM-DD\
    #  We do this AFTER the SMTP send succeeds, so a failed send doesn't
    #  pollute the DELIVERED archive.
    # ───────────────────────────────────────────────────────────────────────
    Write-Step "Archiving delivered ZIP into $DateBucket ..."
    try {
        if (-not (Test-Path -LiteralPath $DeliveredRoot -PathType Container)) {
            New-Item -ItemType Directory -Path $DeliveredRoot -Force -ErrorAction Stop | Out-Null
        }
        if (-not (Test-Path -LiteralPath $DateBucket -PathType Container)) {
            New-Item -ItemType Directory -Path $DateBucket -Force -ErrorAction Stop | Out-Null
        }
        if (Test-Path -LiteralPath $DeliveredZip) {
            # Same client received twice today? Suffix with a timestamp so we never overwrite history.
            $stamp        = Get-Date -Format 'HH-mm-ss'
            $base         = [System.IO.Path]::GetFileNameWithoutExtension($ZipFileName)
            $DeliveredZip = Join-Path $DateBucket "${base}__resent_${stamp}.zip"
            Write-Warn2 "A previous delivery exists today. New archive name: $(Split-Path -Leaf $DeliveredZip)"
        }
        Move-Item -LiteralPath $ZipPath -Destination $DeliveredZip -ErrorAction Stop
        Write-Ok "ZIP moved to: $DeliveredZip"
    } catch {
        Write-Err2 "Could not move ZIP into DELIVERED: $($_.Exception.Message)"
        Write-Info  'The email was already sent — but the archive step failed.'
        Write-Info  "Move the file manually:  $ZipPath  ->  $DeliveredZip"
        exit 7
    }

    # ───────────────────────────────────────────────────────────────────────
    #  STEP 7 — Append/update CLIENT_DATABASE\clients_registry.csv
    #
    #  Schema:
    #    email,account_number,broker,delivery_date,delivery_zip,status
    #
    #  Dedup key: (account_number + broker) — the same MT5 account at the
    #  same broker IS the same license. If a row already exists for that
    #  key, we update it. Otherwise we append. The CSV stays a single
    #  source of truth for downstream CRM / newsletter scripts.
    # ───────────────────────────────────────────────────────────────────────
    Write-Step 'Updating clients_registry.csv ...'
    try {
        if (-not (Test-Path -LiteralPath $RegistryDir -PathType Container)) {
            New-Item -ItemType Directory -Path $RegistryDir -Force -ErrorAction Stop | Out-Null
            Write-Info "Created registry folder: $RegistryDir"
        }

        # Forward-compatible schema. Future scripts MUST keep these columns
        # and may APPEND new ones (e.g., newsletter_status, tags, last_email_at).
        $registryColumns = @('email','account_number','broker','delivery_date','delivery_zip','status')

        # Load existing rows (force array context so + works even if empty).
        $existing = @()
        if (Test-Path -LiteralPath $RegistryFile -PathType Leaf) {
            $existing = @(Import-Csv -LiteralPath $RegistryFile)
        }

        $now    = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
        $update = $false
        if ($existing.Count -gt 0) {
            foreach ($row in $existing) {
                if (($row.account_number -eq $AccountNumber) -and ($row.broker -eq $Broker)) {
                    # Update in place. Keep historical email field current as well.
                    $row.email         = $Recipient
                    $row.delivery_date = $now
                    $row.delivery_zip  = $DeliveredZip
                    $row.status        = 'active_client'
                    $update = $true
                }
            }
        }

        if (-not $update) {
            $newRow = [PSCustomObject]@{
                email          = $Recipient
                account_number = $AccountNumber
                broker         = $Broker
                delivery_date  = $now
                delivery_zip   = $DeliveredZip
                status         = 'active_client'
            }
            $existing = @($existing) + @($newRow)
        }

        # Ensure every row exposes the canonical column set (back-fill if older
        # versions of the script wrote a narrower schema).
        $normalized = $existing | ForEach-Object {
            $r = $_
            $obj = [ordered]@{}
            foreach ($col in $registryColumns) {
                if ($r.PSObject.Properties.Name -contains $col) { $obj[$col] = $r.$col } else { $obj[$col] = '' }
            }
            [PSCustomObject]$obj
        }

        $normalized | Export-Csv -LiteralPath $RegistryFile -NoTypeInformation -Encoding UTF8 -ErrorAction Stop

        if ($update) {
            Write-Ok "Registry row UPDATED for ($AccountNumber / $Broker)."
        } else {
            Write-Ok "Registry row INSERTED for ($AccountNumber / $Broker). Total clients: $($normalized.Count)."
        }
    } catch {
        Write-Err2 "Could not write the registry CSV: $($_.Exception.Message)"
        Write-Info  'Most common cause: the CSV is open in Excel. Close it and re-run JUST the registry step manually.'
        Write-Info  "Registry path: $RegistryFile"
        exit 6
    }

    # ───────────────────────────────────────────────────────────────────────
    #  Success summary
    # ───────────────────────────────────────────────────────────────────────
    Write-Host ''
    Write-Host 'Delivery complete.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Recipient   : ' -NoNewline; Write-Host $Recipient    -ForegroundColor White
    Write-Host 'Account     : ' -NoNewline; Write-Host $AccountNumber -ForegroundColor White
    Write-Host 'Broker      : ' -NoNewline; Write-Host $Broker       -ForegroundColor White
    Write-Host 'Archived to : ' -NoNewline; Write-Host $DeliveredZip -ForegroundColor White
    Write-Host 'Registry    : ' -NoNewline; Write-Host $RegistryFile -ForegroundColor White
    Write-Host ''
    Write-Host 'Next steps:' -ForegroundColor Yellow
    Write-Host '  1. Open compile-dashboard.html and click "Send Email" on this row to flip status -> emailed.'
    Write-Host '  2. Verify the recipient inbox shows the EA file as a regular attachment (no MQ5).'
    Write-Host '  3. The registry is now ready for future newsletter / CRM scripts to consume.'
    Write-Host ''
    exit 0

} catch {
    # ───────────────────────────────────────────────────────────────────────
    #  Catch-all for unexpected errors. Print as much as possible so a
    #  beginner can diagnose without reading the source.
    # ───────────────────────────────────────────────────────────────────────
    Write-Host ''
    Write-Err2 "Unexpected error: $($_.Exception.Message)"
    if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) {
        Write-Info "At line $($_.InvocationInfo.ScriptLineNumber) in $($_.InvocationInfo.ScriptName)"
    }
    exit 99
}

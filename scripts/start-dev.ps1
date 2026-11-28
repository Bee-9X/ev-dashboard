<#
  Starts PLUG EV for local development in one go: checks PostgreSQL, then opens the API, ngrok and the
  admin portal in tabs of one Windows Terminal window (or separate windows without Windows Terminal),
  waits until they are up, shows the charger URL and opens the portal in the browser.

  Run:   double-click start-dev.cmd in the project folder, or:  .\start-dev.cmd
  Stop:  stop-dev.cmd
  Options (pass to start-dev.cmd too):
    -NoNgrok      don't start ngrok (no charger from outside)
    -NoBrowser    don't open the portal in the browser
    -ChargerId c1 the Charger ID used in the URL it shows (default c1)
    -NoWindowsTerminal  separate PowerShell windows instead of Windows Terminal tabs
    -CheckOnly    only the checks (tools, .env, PostgreSQL, free ports); used by the VS Code task
    -StatusOnly   only wait for the apps and show the summary; used by the VS Code task
#>
param(
    [switch]$NoNgrok,
    [switch]$NoBrowser,
    [switch]$NoWindowsTerminal,
    [switch]$CheckOnly,
    [switch]$StatusOnly,
    [string]$ChargerId = 'c1'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$api = Join-Path $root 'plugev-api'
$admin = Join-Path $root 'plugev-admin'

function Write-Step($text) { Write-Host "`n> $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "  OK  $text" -ForegroundColor Green }
function Write-Warn2($text) { Write-Host "  !!  $text" -ForegroundColor Yellow }
function Stop-WithError($text) {
    Write-Host "`n  XX  $text`n" -ForegroundColor Red
    exit 1
}

function Get-PortOwner([int]$port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $c) { return $null }
    $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)" -ErrorAction SilentlyContinue
    if ($p) { return "$($p.Name) (PID $($p.ProcessId)) $($p.CommandLine)" }
    return "PID $($c.OwningProcess)"
}

function Wait-Port([int]$port, [int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

Write-Host "PLUG EV - starting the development setup" -ForegroundColor White

if (-not $StatusOnly) {
    # 1. Tools and files ---------------------------------------------------------------------------------
    Write-Step 'Checking tools and settings'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-WithError 'Node.js is not installed (https://nodejs.org).' }
    Write-Ok "Node $(node -v)"
    if (-not $NoNgrok -and -not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
        Stop-WithError 'ngrok is not installed. Install it (see HOW-TO-RUN.md, A.1) or run with -NoNgrok.'
    }
    if (-not (Test-Path (Join-Path $api '.env'))) {
        Stop-WithError 'plugev-api\.env is missing. Copy plugev-api\.env.example to .env and fill it in (HOW-TO-RUN.md, A.4).'
    }
    Write-Ok 'plugev-api\.env found'

    foreach ($dir in @($api, $admin)) {
        if (-not (Test-Path (Join-Path $dir 'node_modules'))) {
            Write-Warn2 "Packages missing in $(Split-Path -Leaf $dir), installing (first run only)..."
            Push-Location $dir
            try { npm install; if ($LASTEXITCODE -ne 0) { Stop-WithError "npm install failed in $dir" } }
            finally { Pop-Location }
        }
    }
    Write-Ok 'Packages installed'

    # 2. PostgreSQL --------------------------------------------------------------------------------------
    Write-Step 'Checking PostgreSQL'
    $pg = Get-Service 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $pg) {
        Write-Warn2 'No PostgreSQL Windows service found. Continuing; the API will fail if the database is not reachable.'
    } elseif ($pg.Status -ne 'Running') {
        try {
            Start-Service $pg.Name
            Write-Ok "Started $($pg.Name)"
        } catch {
            Stop-WithError "$($pg.Name) is stopped and could not be started (needs Administrator). Open PowerShell as Administrator and run: Start-Service $($pg.Name)"
        }
    } else {
        Write-Ok "$($pg.Name) is running"
    }

    # 3. Ports free? -------------------------------------------------------------------------------------
    Write-Step 'Checking ports'
    $ports = @(
        @{ Port = 4000; Label = 'API' },
        @{ Port = 3003; Label = 'charger port' },
        @{ Port = 3000; Label = 'admin portal' }
    )
    $busy = $false
    foreach ($entry in $ports) {
        $port = $entry.Port
        $owner = Get-PortOwner $port
        if ($owner) {
            $busy = $true
            Write-Warn2 "Port $port ($($entry.Label)) is already in use by: $owner"
            if ($port -eq 3003 -and $owner -match 'plugev-server') { Write-Warn2 '  That is the old gateway (plugev-server): it must not run any more.' }
        }
    }
    if ($busy) { Stop-WithError 'Something is already running. Run stop-dev.cmd first (or close those windows), then start again.' }
    if (-not $NoNgrok -and (Get-Process ngrok -ErrorAction SilentlyContinue)) {
        Stop-WithError 'ngrok is already running. Run stop-dev.cmd first.'
    }
    Write-Ok 'Ports 4000, 3003 and 3000 are free'
    if ($CheckOnly) {
        Write-Host "`n  All checks passed.`n" -ForegroundColor Green
        exit 0
    }

    # 4. Launch ------------------------------------------------------------------------------------------
    Write-Step 'Opening the API, ngrok and the admin portal'
    $tabs = @(
        @{ Title = 'PLUG EV API'; Dir = $api; Cmd = 'npm run start:dev' }
    )
    if (-not $NoNgrok) { $tabs += @{ Title = 'ngrok'; Dir = $root; Cmd = 'ngrok http 3003 --scheme http' } }
    $tabs += @{ Title = 'Admin portal'; Dir = $admin; Cmd = 'npm run dev' }

    # The tabs inherit this script's environment. Some terminals (seen in a VS Code terminal) pass on a PATH where
    # Windows Terminal can't find powershell, which fails each tab with error 0x80070002. So: start powershell by its
    # full path, and make sure PowerShell, Node, npm and ngrok are on the PATH the tabs get.
    $psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $needed = @(
        (Join-Path $env:SystemRoot 'System32'),
        (Split-Path -Parent $psExe),
        (Split-Path -Parent (Get-Command node).Source),
        (Split-Path -Parent (Get-Command npm -ErrorAction SilentlyContinue).Source)
    )
    if (-not $NoNgrok) { $needed += Split-Path -Parent (Get-Command ngrok).Source }
    $env:Path = (($needed + ($env:Path -split ';')) | Where-Object { $_ } | Select-Object -Unique) -join ';'

    if (-not $NoWindowsTerminal -and (Get-Command wt.exe -ErrorAction SilentlyContinue)) {
        # One Windows Terminal window, one tab per app. "-w plugev" groups them in a window named plugev.
        $parts = foreach ($t in $tabs) {
            "new-tab --title `"$($t.Title)`" --suppressApplicationTitle -d `"$($t.Dir)`" $psExe -NoExit -Command `"$($t.Cmd)`""
        }
        Start-Process wt.exe -ArgumentList ("-w plugev " + ($parts -join ' ; '))
        Write-Ok ('Opened in Windows Terminal, tabs: ' + (($tabs | ForEach-Object { $_.Title }) -join ', '))
    } else {
        foreach ($t in $tabs) {
            $cmd = "`$Host.UI.RawUI.WindowTitle = '$($t.Title)'; $($t.Cmd)"
            Start-Process $psExe -WorkingDirectory $t.Dir -ArgumentList '-NoExit', '-Command', "`"$cmd`""
        }
        Write-Ok 'Opened in separate windows'
    }
}

# 5. Wait until they are up --------------------------------------------------------------------------
Write-Step 'Waiting for the API (first start can take ~30 s)'
if (Wait-Port 4000 120) { Write-Ok 'API is up: http://localhost:4000/api/docs' }
else { Write-Warn2 'The API did not open port 4000 within 2 minutes. Look at the "PLUG EV API" tab for the error.' }
if (Wait-Port 3003 15) { Write-Ok 'Charger port 3003 is open' }
else { Write-Warn2 'Charger port 3003 did not open. Check OCPP_ENABLED in plugev-api\.env and the API tab.' }

$publicHost = $null
if (-not $NoNgrok) {
    Write-Step 'Waiting for ngrok'
    $deadline = (Get-Date).AddSeconds(30)
    while (-not $publicHost -and (Get-Date) -lt $deadline) {
        try {
            $t = (Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2).tunnels | Select-Object -First 1
            if ($t) { $publicHost = ([uri]$t.public_url).Host }
        } catch { }
        if (-not $publicHost) { Start-Sleep -Seconds 1 }
    }
    if ($publicHost) { Write-Ok "ngrok is up: $publicHost" }
    else { Write-Warn2 'Could not read the ngrok address. Look at the "ngrok" tab (is the auth token set?).' }
}

Write-Step 'Waiting for the admin portal'
if (Wait-Port 3000 60) {
    Write-Ok 'Admin portal is up: http://localhost:3000'
    if (-not $NoBrowser) { Start-Process 'http://localhost:3000' }
} else {
    Write-Warn2 'The portal did not open port 3000 within a minute. Look at the "Admin portal" tab.'
}

# 6. Summary -----------------------------------------------------------------------------------------
Write-Host "`n================================================================" -ForegroundColor White
Write-Host ' PLUG EV is running' -ForegroundColor Green
Write-Host '   Admin portal   http://localhost:3000'
Write-Host '   API docs       http://localhost:4000/api/docs'
if ($publicHost) {
    $soap = "http://$publicHost/ocpp/$ChargerId"
    Write-Host ''
    Write-Host ' Charger addresses (put these in the charger / SETEC tablet):' -ForegroundColor White
    Write-Host "   SOAP (c1 tablet)  $soap   (port 80)" -ForegroundColor Yellow
    Write-Host "   OCPP 1.6 JSON     ws://$publicHost/ocpp/<Charger ID>"
    try { Set-Clipboard -Value $soap; Write-Host '   (SOAP address copied to the clipboard)' } catch { }
    Write-Host '   ngrok inspector   http://127.0.0.1:4040'
}
Write-Host ''
if ($StatusOnly) { Write-Host ' Logs are in the VS Code terminals. Stop everything with the task "PLUG EV: stop".' }
else { Write-Host ' Logs are in the tabs of the "plugev" terminal window. Stop everything with stop-dev.cmd.' }
Write-Host "================================================================`n" -ForegroundColor White

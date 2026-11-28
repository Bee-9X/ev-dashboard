<#
  Stops what start-dev started: the API (ports 4000 and 3003), the admin portal (port 3000) and ngrok.
  Also stops the old gateway if it holds port 3003. PostgreSQL keeps running (it is a Windows service).

  Only the Node processes behind those ports are stopped; the terminal tabs stay open so you can still read
  the logs. Close the window afterwards.
#>
$ErrorActionPreference = 'Continue'

function Get-Proc([int]$id) { Get-CimInstance Win32_Process -Filter "ProcessId = $id" -ErrorAction SilentlyContinue }

# From the process listening on a port, walk up through node / cmd parents (npm and the Nest / Vite watchers)
# and stop that whole tree, so a watcher can't start the app again. Never goes above the terminal's shell.
function Stop-PortTree([int]$port, [string]$label) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $conn) { Write-Host "  --  $label (port $port): not running" -ForegroundColor DarkGray; return }
    $top = Get-Proc $conn.OwningProcess
    if (-not $top) { return }
    while ($true) {
        $parent = Get-Proc $top.ParentProcessId
        if ($parent -and @('node.exe', 'cmd.exe') -contains $parent.Name) { $top = $parent } else { break }
    }
    taskkill /PID $top.ProcessId /T /F | Out-Null
    Write-Host "  OK  $label (port $port) stopped" -ForegroundColor Green
}

Write-Host 'PLUG EV - stopping the development setup' -ForegroundColor White
Stop-PortTree 4000 'API'
Stop-PortTree 3003 'Charger port'
Stop-PortTree 3000 'Admin portal'

$ngrok = Get-Process ngrok -ErrorAction SilentlyContinue
if ($ngrok) { $ngrok | Stop-Process -Force; Write-Host '  OK  ngrok stopped' -ForegroundColor Green }
else { Write-Host '  --  ngrok: not running' -ForegroundColor DarkGray }

Write-Host "`nDone. PostgreSQL is still running (Windows service). You can close the app terminals now.`n"

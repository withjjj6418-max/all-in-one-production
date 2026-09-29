$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
$appUrl = 'http://127.0.0.1:5186'
$isRunning = $false
try {
  $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
  $isRunning = $response.Content -match 'personal|간트|작업실'
} catch {}
if (-not $isRunning) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) { throw 'Node.js is required to run this app.' }
  Start-Process -FilePath $nodeCommand.Source -ArgumentList ('"' + (Join-Path $appDirectory 'server.mjs') + '"') -WorkingDirectory $appDirectory -WindowStyle Hidden
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    try { $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 1; $isRunning = $response.Content -match 'personal|간트|작업실'; if ($isRunning) { break } } catch {}
  }
}
if (-not $isRunning) { throw 'Could not start Personal Gantt on port 5186.' }
Start-Process $appUrl

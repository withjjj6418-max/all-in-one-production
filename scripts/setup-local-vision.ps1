$ErrorActionPreference = 'Stop'
$modelName = 'gemma4:e2b-it-qat'

Write-Host 'Checking the Windows local vision engine.'
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    winget install --id Ollama.Ollama --exact --accept-package-agreements --accept-source-agreements
  } else {
    Write-Host 'winget is unavailable. Running the official Ollama Windows installer script.'
    $officialInstaller = Invoke-RestMethod -Uri 'https://ollama.com/install.ps1'
    & ([scriptblock]::Create($officialInstaller))
  }
  $ollamaPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
  if (-not (Test-Path -LiteralPath $ollamaPath)) { throw 'Ollama was not found after installation. Open a new PowerShell and run this command again.' }
  $ollama = Get-Item -LiteralPath $ollamaPath
}

$ollamaExe = if ($ollama.Source) { $ollama.Source } else { $ollama.FullName }
Write-Host "Preparing local vision model $modelName. The first run downloads several GB."
& $ollamaExe pull $modelName
if ($LASTEXITCODE -ne 0) { throw 'Failed to download the local vision model.' }

Write-Host 'Ready. Restart npm run dev, then click the batch original-tracing button.'

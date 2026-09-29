$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $projectRoot '.venv-ai'
$python = Join-Path $venv 'Scripts\python.exe'
$modelDirectory = Join-Path $projectRoot 'source-finder\models'
$model = Join-Path $modelDirectory 'inpainting_lama_2025jan.onnx'
$modelUrl = 'https://huggingface.co/opencv/inpainting_lama/resolve/main/inpainting_lama_2025jan.onnx'
$expectedHash = '7DF918AC3921D3DAF0AAE1D219776CF0DC4E4935F035AF81841B40ADCF74FDF2'

if (-not (Test-Path $python)) {
  python -m venv $venv
}

& $python -m pip install --upgrade pip
& $python -m pip install numpy opencv-python-headless onnxruntime

New-Item -ItemType Directory -Force -Path $modelDirectory | Out-Null
if (-not (Test-Path $model)) {
  Invoke-WebRequest -Uri $modelUrl -OutFile $model
}

$actualHash = (Get-FileHash -Algorithm SHA256 $model).Hash
if ($actualHash -ne $expectedHash) {
  throw "LaMa 모델 검증에 실패했습니다. 실제 SHA256: $actualHash"
}

Write-Host 'AI 자연 제거 설치 완료'
Write-Host "Python: $python"
Write-Host "Model:  $model"

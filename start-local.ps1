$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (Test-Path $bundledNode) {
  $node = $bundledNode
} else {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    Write-Host "Node.js est introuvable. Installe Node.js ou lance depuis Codex."
    exit 1
  }
  $node = $nodeCommand.Source
}

Set-Location $projectRoot
Write-Host "Assistant Xavier : http://127.0.0.1:4173"
& $node server.js

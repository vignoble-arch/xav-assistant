param(
  [string]$VpsHost = "51.210.244.28",
  [string]$VpsUser = "ubuntu",
  [int]$RemotePort = 1235,
  [int]$LocalPort = 1234
)

$ErrorActionPreference = "Stop"

$lms = Join-Path $env:USERPROFILE ".lmstudio\bin\lms.exe"
if (-not (Test-Path $lms)) {
  throw "LM Studio CLI introuvable : $lms"
}

Write-Host "Verification de Gemma dans LM Studio..."
& $lms load "google/gemma-4-12b" | Out-Host

Write-Host "Verification du serveur LM Studio..."
try {
  Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/v1/models" -TimeoutSec 5 | Out-Null
} catch {
  Write-Host "Demarrage du serveur LM Studio..."
  & $lms server start --port $LocalPort --bind 127.0.0.1 | Out-Host
}

Write-Host "Ouverture du pont PC -> VPS..."
Write-Host "VPS : http://host.docker.internal:$RemotePort/v1"
Write-Host "Garde cette fenetre ouverte tant que tu veux utiliser Gemma depuis le VPS."

ssh -N `
  -o ExitOnForwardFailure=yes `
  -o ServerAliveInterval=30 `
  -o ServerAliveCountMax=3 `
  -R "0.0.0.0:$RemotePort`:127.0.0.1:$LocalPort" `
  "$VpsUser@$VpsHost"

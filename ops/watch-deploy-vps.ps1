param(
  [string]$HostName = "51.210.244.28",
  [string]$UserName = "ubuntu",
  [string]$RemotePath = "/opt/assistant-xavier",
  [int]$CheckSeconds = 5
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$deployScript = Join-Path $projectRoot "ops\deploy-vps.ps1"

function Get-ProjectFingerprint {
  $ignored = @(
    "\\data\\",
    "\\backups\\",
    "\\.deploy-temp\\",
    "\\node_modules\\",
    "\\.git\\",
    "\\.agents\\",
    "\\.codex\\"
  )
  $ignoredFiles = @(
    "assistant-xavier-deploy.zip",
    ".env",
    ".env.production",
    ".env.production.vps"
  )

  $files = Get-ChildItem -Path $projectRoot -Recurse -File | Where-Object {
    $fullName = $_.FullName
    $name = $_.Name
    -not ($ignored | Where-Object { $fullName.Contains($_) }) -and
    -not ($ignoredFiles -contains $name)
  }

  $latest = ($files | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc.Ticks
  $count = ($files | Measure-Object).Count
  return "$count-$latest"
}

function Invoke-VpsDeploy {
  Write-Host ""
  Write-Host "Changement detecte. Envoi vers le VPS..."
  powershell -ExecutionPolicy Bypass -File $deployScript -HostName $HostName -UserName $UserName -RemotePath $RemotePath
  ssh "${UserName}@${HostName}" "cd '$RemotePath' && docker compose --profile public up -d --build"
  Write-Host "Deploiement termine."
  Write-Host ""
}

Write-Host "Surveillance active du projet Assistant Xavier."
Write-Host "VPS : ${UserName}@${HostName}:$RemotePath"
Write-Host "Pour arreter : Ctrl+C"
Write-Host ""

$lastFingerprint = Get-ProjectFingerprint

while ($true) {
  Start-Sleep -Seconds $CheckSeconds
  $currentFingerprint = Get-ProjectFingerprint
  if ($currentFingerprint -ne $lastFingerprint) {
    $lastFingerprint = $currentFingerprint
    try {
      Invoke-VpsDeploy
      $lastFingerprint = Get-ProjectFingerprint
    } catch {
      Write-Host "Erreur pendant le deploiement : $($_.Exception.Message)"
      Write-Host "La surveillance continue."
    }
  }
}

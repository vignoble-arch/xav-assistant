param(
  [string]$HostName = "51.210.244.28",
  [string]$UserName = "ubuntu",
  [string]$AppUrl = "https://vps-b6bb35e6.vps.ovh.net",
  [string]$RemotePath = "/opt/assistant-xavier"
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "== $Title =="
}

Write-Section "Application"
try {
  $health = Invoke-RestMethod -Uri "$AppUrl/api/health" -TimeoutSec 15
  Write-Host "App : OK"
  Write-Host "Heure serveur app : $($health.time)"
} catch {
  Write-Host "App : ERREUR - $($_.Exception.Message)"
}

Write-Section "Synchronisation Google"
try {
  $sync = Invoke-RestMethod -Uri "$AppUrl/api/sync/status" -TimeoutSec 15
  Write-Host "En cours : $($sync.inProgress)"
  Write-Host "Derniere fin : $($sync.lastFinishedAt)"
  Write-Host "Intervalle auto : $($sync.autoSyncIntervalMinutes) min"
  Write-Host "Resultats : $($sync.lastResults | ConvertTo-Json -Compress)"
  Write-Host "Erreurs : $($sync.lastErrors | ConvertTo-Json -Compress)"
} catch {
  Write-Host "Statut synchro : ERREUR - $($_.Exception.Message)"
}

Write-Section "Docker et disque VPS"
$remoteTarget = ('{0}@{1}' -f $UserName, $HostName)
$remoteCommand = "cd '$RemotePath' && docker compose ps && echo '' && df -h / && echo '' && du -sh backups 2>/dev/null || true"
ssh $remoteTarget $remoteCommand

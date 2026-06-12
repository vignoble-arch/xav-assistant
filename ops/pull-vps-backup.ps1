param(
  [string]$HostName = "51.210.244.28",
  [string]$UserName = "ubuntu",
  [string]$RemotePath = "/opt/assistant-xavier",
  [string]$LocalBackupRoot = "",
  [int]$RemoteRetentionDays = 30,
  [int]$LocalRetentionDays = 180
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if ([string]::IsNullOrWhiteSpace($LocalBackupRoot)) {
  $LocalBackupRoot = Join-Path $projectRoot "backups\vps"
}

New-Item -ItemType Directory -Path $LocalBackupRoot -Force | Out-Null

$logFile = Join-Path $LocalBackupRoot "backup-log.txt"
$startedTranscript = $false
try {
  Start-Transcript -Path $logFile -Append | Out-Null
  $startedTranscript = $true
} catch {
  Write-Host "Journal de sauvegarde indisponible : $($_.Exception.Message)"
}

$remoteBackupDir = "$RemotePath/backups"
$remoteTarget = ('{0}@{1}' -f $UserName, $HostName)
$remoteBackupSource = ('{0}:{1}/*' -f $remoteTarget, $remoteBackupDir)
$remoteCommand = "cd '$RemotePath' && sh ops/backup.sh && find '$remoteBackupDir' -type f -mtime +$RemoteRetentionDays -delete"

try {
  Write-Host "Sauvegarde VPS en cours..."
  ssh $remoteTarget $remoteCommand

  Write-Host "Copie des sauvegardes vers : $LocalBackupRoot"
  scp $remoteBackupSource $LocalBackupRoot

  $cutoff = (Get-Date).AddDays(-$LocalRetentionDays)
  Get-ChildItem -Path $LocalBackupRoot -File | Where-Object {
    $_.LastWriteTime -lt $cutoff
  } | Remove-Item -Force

  Write-Host "Sauvegarde terminee."
  Write-Host "Dossier local : $LocalBackupRoot"
} finally {
  if ($startedTranscript) {
    Stop-Transcript | Out-Null
  }
}

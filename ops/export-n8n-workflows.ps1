param(
  [string]$HostName = "51.210.244.28",
  [string]$UserName = "ubuntu",
  [string]$VpsPath = "/opt/assistant-xavier",
  [string]$OutputDir = "backups\n8n-workflows"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$localOutput = Join-Path $projectRoot $OutputDir
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$remoteDir = "/tmp/assistant-xavier-n8n-workflows-$stamp"
$archiveName = "n8n-workflows-$stamp.tgz"
$remoteArchive = "/tmp/$archiveName"
$localArchive = Join-Path $localOutput $archiveName

New-Item -ItemType Directory -Force -Path $localOutput | Out-Null

Write-Host "Export des workflows n8n depuis le VPS..."
ssh "$UserName@$HostName" "cd '$VpsPath' && rm -rf '$remoteDir' '$remoteArchive' && mkdir -p '$remoteDir' && docker compose exec -T n8n n8n export:workflow --backup --output='$remoteDir' >/tmp/assistant-xavier-n8n-export.log 2>&1 && tar -czf '$remoteArchive' -C '$remoteDir' . && cat /tmp/assistant-xavier-n8n-export.log"

Write-Host "Telechargement : $localArchive"
scp "${UserName}@${HostName}:$remoteArchive" "$localArchive" | Out-Null

ssh "$UserName@$HostName" "rm -rf '$remoteDir' '$remoteArchive' /tmp/assistant-xavier-n8n-export.log" | Out-Null

Write-Host "Sauvegarde n8n terminee : $localArchive"

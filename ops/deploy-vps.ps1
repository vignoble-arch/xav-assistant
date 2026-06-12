param(
  [string]$HostName = "51.210.244.28",
  [string]$UserName = "ubuntu",
  [string]$RemotePath = "/opt/assistant-xavier"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$archive = Join-Path $projectRoot "assistant-xavier-deploy.zip"
$tempDir = Join-Path $projectRoot ".deploy-temp"

if (Test-Path $archive) {
  Remove-Item $archive -Force
}
if (Test-Path $tempDir) {
  Remove-Item $tempDir -Recurse -Force
}

New-Item -ItemType Directory -Path $tempDir | Out-Null

$include = @(
  "app.js",
  "Caddyfile",
  "docker-compose.yml",
  "Dockerfile",
  "index.html",
  "quick-note.html",
  "quick-note.css",
  "quick-note.js",
  "icon.svg",
  "manifest.webmanifest",
  "package.json",
  "README.md",
  "server.js",
  "service-worker.js",
  "styles.css",
  ".dockerignore",
  ".env.production.example"
)

foreach ($item in $include) {
  Copy-Item -Path (Join-Path $projectRoot $item) -Destination $tempDir -Force
}

Copy-Item -Path (Join-Path $projectRoot "docs") -Destination $tempDir -Recurse -Force
Copy-Item -Path (Join-Path $projectRoot "ops") -Destination $tempDir -Recurse -Force

Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $archive -Force
Remove-Item $tempDir -Recurse -Force

Write-Host "Archive prete : $archive"
Write-Host "Envoi vers $UserName@${HostName}:$RemotePath ..."
scp $archive "${UserName}@${HostName}:/tmp/assistant-xavier-deploy.zip"

Write-Host "Deploiement distant..."
ssh "${UserName}@${HostName}" "mkdir -p '$RemotePath' && unzip -o /tmp/assistant-xavier-deploy.zip -d '$RemotePath' && cd '$RemotePath' && cp -n .env.production.example .env.production && echo 'Fichiers deployes. Remplir .env.production puis lancer docker compose.'"

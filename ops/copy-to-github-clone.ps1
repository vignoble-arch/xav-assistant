param(
  [string]$Source = "C:\Users\vigno\OneDrive\Documents\nouveau projet",
  [string]$Destination = "C:\Users\vigno\OneDrive\Documents\GitHub\xav-assistant"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Source)) {
  throw "Dossier source introuvable : $Source"
}

if (-not (Test-Path $Destination)) {
  throw "Dossier GitHub introuvable : $Destination"
}

if (-not (Test-Path (Join-Path $Destination ".git"))) {
  throw "Le dossier destination ne semble pas etre un depot Git : $Destination"
}

$excludedDirs = @(".git", "data", "backups", "node_modules")
$excludedFiles = @(
  ".env",
  ".env.production",
  "google-tokens.json",
  "*.log",
  "*.zip",
  "*.bak",
  "*.tmp",
  "Fiche_*.pdf"
)

Write-Host "Copie de l'application vers le depot GitHub..."
robocopy $Source $Destination /E /XD $excludedDirs /XF $excludedFiles /NFL /NDL /NJH /NJS /NP
$code = $LASTEXITCODE

if ($code -gt 7) {
  throw "Robocopy a echoue avec le code $code"
}

Write-Host ""
Write-Host "Copie terminee."
Write-Host "Depot GitHub : $Destination"
Write-Host ""
Write-Host "Prochaine etape :"
Write-Host "cd `"$Destination`""
Write-Host "git status"

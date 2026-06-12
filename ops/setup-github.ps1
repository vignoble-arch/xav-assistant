param(
  [string]$RemoteUrl = "https://github.com/vignoble-arch/xav-assistant.git",
  [string]$Branch = "main",
  [string]$CommitMessage = "Initial Assistant Xavier project"
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "== $Message =="
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git n'est pas disponible dans ce PowerShell. Installe Git pour Windows, puis rouvre PowerShell."
}

Write-Step "Verification du dossier"
if (-not (Test-Path ".\server.js") -or -not (Test-Path ".\index.html")) {
  throw "Lance ce script depuis le dossier Assistant Xavier."
}

Write-Step "Initialisation Git"
if (-not (Test-Path ".\.git")) {
  git init
}

git branch -M $Branch

Write-Step "Configuration du depot distant"
$existingRemote = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
  git remote add origin $RemoteUrl
} elseif ($existingRemote -ne $RemoteUrl) {
  git remote set-url origin $RemoteUrl
}

Write-Step "Verification des fichiers prives ignores"
$privateCandidates = @(".env", ".env.production", "data\google-tokens.json", "data\app-state.json", "data\ai-memory.json")
foreach ($file in $privateCandidates) {
  if (Test-Path $file) {
    $ignored = git check-ignore $file 2>$null
    if (-not $ignored) {
      throw "Protection stoppee : $file n'est pas ignore par Git."
    }
  }
}

Write-Step "Preparation du commit"
git add .

$status = git status --short
if (-not $status) {
  Write-Host "Aucun changement a envoyer."
} else {
  git status --short
  git commit -m $CommitMessage
}

Write-Step "Verification du depot GitHub"
git ls-remote --exit-code --heads origin $Branch *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "La branche $Branch existe deja sur GitHub."
  Write-Host "Par securite, je ne force rien. Utilise ensuite : git pull --rebase origin $Branch"
  Write-Host "Puis : git push -u origin $Branch"
  exit 0
}

Write-Step "Envoi vers GitHub"
git push -u origin $Branch

Write-Host ""
Write-Host "GitHub est configure : $RemoteUrl"

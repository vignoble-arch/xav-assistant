param(
  [string]$Model = "gpt-5.4-mini"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $projectRoot ".env"

Write-Host "Configuration OpenAI locale pour Assistant Xavier"
Write-Host "La cle API ne sera pas affichee."

$secureKey = Read-Host "Cle API OpenAI" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto($keyPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}

if ([string]::IsNullOrWhiteSpace($plainKey)) {
  throw "Cle API OpenAI vide."
}

if (-not (Test-Path $envFile)) {
  New-Item -ItemType File -Path $envFile -Force | Out-Null
}

$lines = Get-Content -Path $envFile -ErrorAction SilentlyContinue
$filtered = $lines | Where-Object {
  $_ -notmatch '^(AI_PROVIDER|AI_BASE_URL|AI_MODEL|OPENAI_API_KEY)='
}

$next = @($filtered) + @(
  "AI_PROVIDER=openai",
  "AI_BASE_URL=https://api.openai.com/v1",
  "AI_MODEL=$Model",
  "OPENAI_API_KEY=$plainKey"
)

try {
  Set-Content -Path $envFile -Value $next -Encoding UTF8
  Write-Host ""
  Write-Host "OpenAI est configure en local avec le modele : $Model"
} finally {
  $plainKey = $null
}

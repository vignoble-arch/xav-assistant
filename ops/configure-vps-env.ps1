param(
  [string]$HostName = "51.210.244.28",
  [string]$UserName = "ubuntu",
  [string]$RemotePath = "/opt/assistant-xavier",
  [string]$AppDomain = "vps-b6bb35e6.vps.ovh.net"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$localEnvPath = Join-Path $projectRoot ".env"

function Read-EnvFile($path) {
  $values = @{}
  if (-not (Test-Path $path)) {
    return $values
  }
  foreach ($line in Get-Content $path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) {
      continue
    }
    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }
  return $values
}

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).Replace("+", "A").Replace("/", "B").TrimEnd("=")
  } finally {
    $rng.Dispose()
  }
}

function ConvertTo-PlainText($secureString) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

$envValues = Read-EnvFile $localEnvPath
$googleClientId = $envValues["GOOGLE_CLIENT_ID"]
$googleClientSecret = $envValues["GOOGLE_CLIENT_SECRET"]

if (-not $googleClientId -or -not $googleClientSecret) {
  throw "Google OAuth est introuvable dans .env local. Configure d'abord Google dans l'app locale."
}

$assistantPasswordSecure = Read-Host "Mot de passe prive pour ouvrir Assistant Xavier sur le VPS (laisser vide pour aucun)" -AsSecureString
$assistantPassword = ConvertTo-PlainText $assistantPasswordSecure

$postgresPassword = New-RandomSecret
$tempEnv = Join-Path $projectRoot ".env.production.vps"

@(
  "# Assistant Xavier - configuration serveur privee"
  "APP_DOMAIN=$AppDomain"
  ""
  "ASSISTANT_USER=xavier"
  "ASSISTANT_PASSWORD=$assistantPassword"
  ""
  "GOOGLE_CLIENT_ID=$googleClientId"
  "GOOGLE_CLIENT_SECRET=$googleClientSecret"
  "GOOGLE_REDIRECT_URI=https://$AppDomain/auth/google/callback"
  ""
  "POSTGRES_PASSWORD=$postgresPassword"
  ""
  "AI_PROVIDER=openai"
  "AI_BASE_URL=https://api.openai.com/v1"
  "AI_MODEL=gpt-5.4-mini"
  "OPENAI_API_KEY="
  ""
) | Set-Content -Path $tempEnv -Encoding UTF8

try {
  Write-Host "Envoi de la configuration serveur..."
  scp $tempEnv "${UserName}@${HostName}:/tmp/.env.production"
  ssh "${UserName}@${HostName}" "mv /tmp/.env.production '$RemotePath/.env.production' && chmod 600 '$RemotePath/.env.production'"
  Write-Host "Configuration envoyee sur le VPS."
  Write-Host "Callback Google a ajouter : https://$AppDomain/auth/google/callback"
} finally {
  Remove-Item $tempEnv -Force -ErrorAction SilentlyContinue
}

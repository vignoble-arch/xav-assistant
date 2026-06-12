param(
  [string]$HostName = "51.210.244.28",
  [string]$UserName = "ubuntu",
  [string]$RemotePath = "/opt/assistant-xavier",
  [string]$Model = "gpt-5.4-mini"
)

$ErrorActionPreference = "Stop"

Write-Host "Configuration OpenAI pour Assistant Xavier VPS"
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

$remoteTarget = ('{0}@{1}' -f $UserName, $HostName)
$encodedKey = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($plainKey))
$encodedModel = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Model))

$remoteScript = @"
set -eu
cd '$RemotePath'
cp .env.production ".env.production.bak.`$(date +%Y%m%d%H%M%S)"
KEY=`$(printf '%s' '$encodedKey' | base64 -d)
MODEL=`$(printf '%s' '$encodedModel' | base64 -d)
grep -v -E '^(AI_PROVIDER|AI_BASE_URL|AI_MODEL|OPENAI_API_KEY)=' .env.production > .env.production.tmp
cat >> .env.production.tmp <<ENVEOF
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=`$MODEL
OPENAI_API_KEY=`$KEY
ENVEOF
mv .env.production.tmp .env.production
docker compose --profile public up -d --build assistant caddy
"@

try {
  $remoteScript | ssh $remoteTarget "bash -s"
  Write-Host ""
  Write-Host "OpenAI est configure sur le VPS avec le modele : $Model"
} finally {
  $plainKey = $null
}

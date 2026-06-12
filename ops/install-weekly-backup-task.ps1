param(
  [string]$TaskName = "Assistant Xavier - Sauvegarde VPS",
  [string]$At = "03:00",
  [ValidateSet("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")]
  [string]$DayOfWeek = "Sunday"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backupScript = Join-Path $projectRoot "ops\pull-vps-backup.ps1"

if (-not (Test-Path $backupScript)) {
  throw "Script introuvable : $backupScript"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`"" `
  -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $At
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Sauvegarde hebdomadaire Assistant Xavier depuis le VPS vers OneDrive." `
  -Force | Out-Null

Write-Host "Planification creee : $TaskName"
Write-Host "Frequence : chaque $DayOfWeek a $At"
Write-Host "Sauvegardes locales : $(Join-Path $projectRoot 'backups\vps')"

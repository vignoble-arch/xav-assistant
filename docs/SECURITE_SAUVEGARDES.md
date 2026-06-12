# Securite et sauvegardes

## Etat au 12 juin 2026

- GitHub est connecte au depot public `vignoble-arch/xav-assistant`.
- Les fichiers sensibles ne sont pas publies sur GitHub.
- Une sauvegarde VPS manuelle a ete creee et copiee dans OneDrive.
- L'application affiche maintenant un etat systeme : Google, IA, sauvegardes et protection GitHub.

## Fichiers proteges

Ces fichiers restent en local et ne doivent pas etre envoyes dans le depot public :

- `.env`
- `.env.production`
- `data/*.json`
- `google-tokens.json`
- `*.log`
- `*.zip`
- `backups/`

## Lancer une sauvegarde manuelle

Double-cliquer sur :

```text
ops\backup-now.bat
```

Ou lancer dans PowerShell :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\pull-vps-backup.ps1"
```

Les sauvegardes locales arrivent ici :

```text
C:\Users\vigno\OneDrive\Documents\nouveau projet\backups\vps
```

## Activer la sauvegarde hebdomadaire

Si Windows refuse la creation automatique, ouvrir PowerShell en administrateur puis lancer :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\install-weekly-backup-task.ps1"
```

Par defaut, la sauvegarde est planifiee le dimanche a 03:00.

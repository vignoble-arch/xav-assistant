# MCP Assistant Xavier Ops

Ce serveur MCP expose uniquement des actions controlees pour exploiter Assistant Xavier.

## Outils disponibles

- `config_summary` : verifie les variables lues, sans afficher les secrets.
- `app_health` : verifie `/api/health`.
- `check_google_sync` : lit `/api/sync/status`.
- `vps_status` : lance le diagnostic PowerShell complet.
- `read_logs` : lit les logs Docker d'un service autorise.
- `restart_vps` : relance la stack Docker publique.
- `deploy_vps` : deploie puis reconstruit Docker.
- `backup_vps` : lance la sauvegarde hors VPS.

## Configuration MCP

Nom :

```text
assistant-xavier-ops
```

Commande recommandee :

```text
C:\Users\vigno\OneDrive\Documents\nouveau projet\mcp\assistant-xavier-ops\start-mcp.cmd
```

Aucun argument.

Alternative si `node` est disponible directement :

Commande :

```text
node
```

Arguments :

```text
C:\Users\vigno\OneDrive\Documents\nouveau projet\mcp\assistant-xavier-ops\server.js
```

Variables, en mode cle / valeur :

```text
PROJECT_ROOT = C:\Users\vigno\OneDrive\Documents\nouveau projet
VPS_HOST = 51.210.244.28
VPS_USER = ubuntu
VPS_PATH = /opt/assistant-xavier
APP_URL = https://vps-b6bb35e6.vps.ovh.net
```

Si tu remets un mot de passe sur l'application :

```text
ASSISTANT_USER = xavier
ASSISTANT_PASSWORD = ton-mot-de-passe
```

Redemarrer Codex apres modification de la configuration MCP.

## Test local

Depuis PowerShell :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\mcp\assistant-xavier-ops\test-mcp.ps1"
```

Si `node` n'est pas trouve, utiliser le chemin complet donne par :

```powershell
where node
```

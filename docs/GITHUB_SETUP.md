# Mise en place GitHub

Depot cible :

```text
https://github.com/vignoble-arch/xav-assistant
```

## Etat actuel

- Le dossier local n'est pas encore initialise en depot Git.
- Le connecteur GitHub Codex est installe, mais aucun compte GitHub n'est encore autorise dans Codex.
- Le depot est public, donc il faut verifier les fichiers ignores avant le premier envoi.

## Fichiers a ne jamais envoyer

Ces fichiers sont ignores par `.gitignore` :

- `.env`
- `.env.production`
- `data/*.json`
- `google-tokens.json`
- `*.log`
- `*.zip`
- `backups/`

## Premier envoi depuis PowerShell

Depuis le dossier du projet :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\setup-github.ps1"
```

Si PowerShell dit que `git` est introuvable, installer Git pour Windows puis rouvrir PowerShell.

## Cote Codex

Dans Codex, il faut aussi connecter GitHub :

1. Ouvrir les connecteurs ou Apps.
2. Choisir GitHub.
3. Connecter le compte `vignoble-arch`.
4. Autoriser le depot `vignoble-arch/xav-assistant`.

Quand c'est fait, Codex pourra chercher le depot, ouvrir des pull requests et suivre les changements proprement.

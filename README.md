# Assistant Xavier - V0.2 locale et serveur

Premiere base de l'application personnelle de Xavier.

Cette version fonctionne soit directement dans le navigateur, soit avec un petit serveur local pour activer la sauvegarde durable et les connexions Google. Elle contient aussi une preparation VPS pour un deploiement Docker avec HTTPS, PostgreSQL et memoire RAG.

## Contenu

- Dashboard desktop-first
- Inbox centrale
- Taches avec statuts, priorites, categories et echeances
- Rappels
- Notes
- Listes rapides
- Assistant texte local avec classement simple
- Sauvegarde dans le navigateur via localStorage en mode fichier
- Sauvegarde durable dans `data/app-state.json` en mode serveur
- Connexions Google OAuth preparees pour Gmail, Agenda, Drive et Google Tasks
- Preparation serveur Docker
- PostgreSQL et Qdrant prets pour la prochaine etape memoire/RAG
- Configuration IA locale avec LM Studio

## Lancer

Mode simple :

Ouvrir `index.html` dans un navigateur.

Mode V0.2 local :

```powershell
.\start-local.ps1
```

Si PowerShell bloque le fichier `.ps1`, double-cliquer sur :

```text
start-local.bat
```

Avec Git Bash :

```bash
./start-local.sh
```

Puis ouvrir :

```text
http://127.0.0.1:4173
```

## Configurer Google OAuth

Methode recommandee :

1. Lancer l'app en mode V0.2 local.
2. Ouvrir l'onglet Connexions.
3. Coller le Google Client ID et le Google Client Secret.
4. Enregistrer la configuration.
5. Connecter Gmail, Agenda et Drive.

L'app ecrit les secrets dans `.env`, qui est ignore par Git.

Methode manuelle :

Creer un fichier `.env` ou definir ces variables avant de lancer le serveur :

```powershell
$env:GOOGLE_CLIENT_ID="..."
$env:GOOGLE_CLIENT_SECRET="..."
$env:GOOGLE_REDIRECT_URI="http://127.0.0.1:4173/auth/google/callback"
.\start-local.ps1
```

Dans Google Cloud, l'URL de callback OAuth doit etre :

```text
http://127.0.0.1:4173/auth/google/callback
```

## Preparation VPS

Fichiers ajoutes pour le serveur :

- `Dockerfile` : emballage de l'application.
- `docker-compose.yml` : app, PostgreSQL, Qdrant et Caddy.
- `Caddyfile` : HTTPS automatique avec le domaine.
- `.env.production.example` : modele de configuration privee du serveur.

Sur le VPS, il faudra copier `.env.production.example` vers `.env.production`, puis remplir :

```text
APP_DOMAIN=assistant.ton-domaine.fr
ASSISTANT_USER=xavier
ASSISTANT_PASSWORD=un-long-mot-de-passe
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://assistant.ton-domaine.fr/auth/google/callback
POSTGRES_PASSWORD=un-long-mot-de-passe
```

Premiere mise en route sans exposition publique :

```bash
docker compose up -d --build assistant postgres qdrant
```

Mise en route publique avec HTTPS :

```bash
docker compose --profile public up -d --build
```

Verification :

```text
https://assistant.ton-domaine.fr/api/health
```

L'application publique demandera l'identifiant et le mot de passe definis dans `.env.production`.

## Prochaine etape logique

Ajouter une authentification privee avant exposition publique, puis migrer les donnees importantes vers PostgreSQL.

## Synchronisation automatique

Le serveur tente une synchronisation Google automatique toutes les 15 minutes quand les connexions sont actives.

Regler l'intervalle dans `.env` ou `.env.production` :

```text
AUTO_SYNC_INTERVAL_MINUTES=15
```

Verifier l'etat depuis le navigateur :

```text
https://vps-b6bb35e6.vps.ovh.net/api/sync/status
```

Verifier l'etat depuis PowerShell :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\vps-status.ps1"
```

## MCP Assistant Xavier Ops

Le dossier `mcp/assistant-xavier-ops` contient un serveur MCP local qui donne a Codex des actions controlees sur le VPS :

- verifier l'application ;
- lire le statut Google ;
- lire les logs Docker ;
- relancer ou deployer le VPS ;
- lancer une sauvegarde hors VPS.

Voir `mcp/assistant-xavier-ops/README.md` pour les champs a renseigner dans Codex.

## Sauvegarde hors VPS

Le VPS peut creer une sauvegarde de ses volumes Docker, de Qdrant et de PostgreSQL, puis le PC peut rapatrier ces fichiers dans OneDrive.

Test manuel depuis PowerShell :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\pull-vps-backup.ps1"
```

Installer la sauvegarde hebdomadaire Windows :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\install-weekly-backup-task.ps1"
```

Par defaut, les fichiers sont copies dans :

```text
C:\Users\vigno\OneDrive\Documents\nouveau projet\backups\vps
```

La procedure de restauration est dans `docs/RESTAURATION_VPS.md`.

## Installer sur tablette

L'application est preparee comme application web installable.

Adresse a ouvrir sur la tablette :

```text
https://vps-b6bb35e6.vps.ovh.net
```

Sur iPad :

1. Ouvrir l'adresse dans Safari.
2. Appuyer sur le bouton de partage.
3. Choisir `Ajouter a l'ecran d'accueil`.
4. Valider le nom `Assistant Xavier`.

Sur tablette Android :

1. Ouvrir l'adresse dans Chrome.
2. Ouvrir le menu avec les trois points.
3. Choisir `Installer l'application` ou `Ajouter a l'ecran d'accueil`.
4. Valider.

## Notification du matin

Dans la vue du jour, le bloc `Routine matin` permet d'activer une notification locale.

1. Choisir l'heure.
2. Cliquer sur `Activer notif`.
3. Accepter la demande de notification de la tablette.

Cette premiere version depend de l'app installee sur l'appareil. Une version push serveur pourra ensuite envoyer les notifications meme lorsque l'app n'est pas ouverte.

## LM Studio local

Dans LM Studio, charger un modele puis demarrer le serveur local.

Adresse attendue en local :

```text
http://127.0.0.1:1234/v1
```

Dans l'application, ouvrir `Connexions`, puis utiliser le bloc `IA locale > LM Studio` pour enregistrer et tester la connexion.

# Installation VPS - Assistant Xavier

Objectif : installer le serveur central de l'assistant sur un VPS OVH Ubuntu 24.04 LTS.

## 1. Preparation chez OVH

Choisir :

- Type : VPS
- Offre : VPS-3
- Systeme : Ubuntu 24.04 LTS
- Region : France ou Europe

Conserver :

- Adresse IP du VPS
- Utilisateur fourni par OVH
- Mot de passe temporaire ou cle SSH

## 2. Securisation initiale

Actions prevues :

- creer un utilisateur admin dedie
- installer les mises a jour
- activer le pare-feu
- autoriser SSH, HTTP et HTTPS
- desactiver les acces inutiles

Depuis PowerShell, tester d'abord l'acces SSH :

```powershell
ssh ubuntu@51.210.244.28
```

Si le serveur demande une confirmation, repondre `yes`, puis saisir le mot de passe OVH.

Ensuite, sur le VPS :

```bash
mkdir -p /tmp/assistant-install
exit
```

Puis depuis PowerShell, envoyer le script d'installation :

```powershell
scp ".\ops\vps-install.sh" ubuntu@51.210.244.28:/tmp/assistant-install/vps-install.sh
ssh ubuntu@51.210.244.28 "bash /tmp/assistant-install/vps-install.sh"
```

## 3. Installation technique

Installer :

- Docker
- Docker Compose
- Git
- Caddy pour HTTPS

## 4. Configuration de l'application

Creer `.env.production` a partir de `.env.production.example`.

Valeurs importantes :

```text
APP_DOMAIN=assistant.ton-domaine.fr
ASSISTANT_USER=xavier
ASSISTANT_PASSWORD=mot-de-passe-long
GOOGLE_REDIRECT_URI=https://assistant.ton-domaine.fr/auth/google/callback
POSTGRES_PASSWORD=mot-de-passe-long
```

Depuis PowerShell, envoyer les fichiers de l'application :

```powershell
powershell -ExecutionPolicy Bypass -File ".\ops\deploy-vps.ps1"
```

## 5. Premiere mise en route privee

Sans domaine public :

```bash
docker compose up -d --build assistant postgres qdrant
```

Verification locale sur le VPS :

```bash
curl http://127.0.0.1:4173/api/health
```

## 6. Mise en ligne HTTPS

Une fois le domaine pointe vers le VPS :

```bash
docker compose --profile public up -d --build
```

Verification :

```bash
curl https://assistant.ton-domaine.fr/api/health
```

## 7. Google Cloud

Ajouter l'URL suivante dans les callbacks OAuth autorises :

```text
https://assistant.ton-domaine.fr/auth/google/callback
```

Puis reconnecter Gmail, Agenda, Drive et Google Tasks depuis l'interface.

## 8. Sauvegardes

Lancer :

```bash
sh ops/backup.sh
```

Les sauvegardes sont placees dans le dossier `backups/`.

Depuis le PC, rapatrier une copie hors VPS :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\pull-vps-backup.ps1"
```

Installer la planification hebdomadaire sur Windows :

```powershell
powershell -ExecutionPolicy Bypass -File ".\ops\install-weekly-backup-task.ps1"
```

Les copies locales sont conservees dans `backups\vps`, donc dans OneDrive si le dossier du projet est synchronise.

## 9. Controle rapide du VPS

Depuis PowerShell :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\vps-status.ps1"
```

Ce controle verifie :

- la reponse HTTPS de l'application ;
- le statut de synchronisation Google ;
- les conteneurs Docker ;
- l'espace disque du VPS ;
- le volume occupe par les sauvegardes.

## 10. Etape suivante

Migrer les donnees principales de `data/app-state.json` vers PostgreSQL, puis brancher la memoire RAG sur Qdrant.

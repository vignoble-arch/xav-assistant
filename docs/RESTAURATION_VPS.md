# Restauration VPS - Assistant Xavier

Objectif : remettre l'application en route si le VPS doit etre reconstruit ou si les donnees doivent etre restaurees.

## 1. Reinstaller le VPS

Depuis PowerShell, dans le dossier projet :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
scp ".\ops\vps-install.sh" ubuntu@51.210.244.28:/tmp/vps-install.sh
ssh ubuntu@51.210.244.28 "bash /tmp/vps-install.sh"
```

## 2. Redeployer l'application

```powershell
powershell -ExecutionPolicy Bypass -File ".\ops\deploy-vps.ps1"
```

Puis sur le VPS :

```powershell
ssh ubuntu@51.210.244.28
cd /opt/assistant-xavier
```

Verifier que `.env.production` contient les bonnes valeurs avant de relancer Docker.

## 3. Envoyer les sauvegardes sur le VPS

Les sauvegardes locales sont dans :

```text
C:\Users\vigno\OneDrive\Documents\nouveau projet\backups\vps
```

Choisir le meme horodatage pour les trois fichiers :

```text
assistant-data-YYYYMMDD-HHMMSS.tgz
qdrant-data-YYYYMMDD-HHMMSS.tgz
postgres-YYYYMMDD-HHMMSS.sql
```

Envoyer les fichiers :

```powershell
scp ".\backups\vps\assistant-data-YYYYMMDD-HHMMSS.tgz" ubuntu@51.210.244.28:/tmp/
scp ".\backups\vps\qdrant-data-YYYYMMDD-HHMMSS.tgz" ubuntu@51.210.244.28:/tmp/
scp ".\backups\vps\postgres-YYYYMMDD-HHMMSS.sql" ubuntu@51.210.244.28:/tmp/
```

## 4. Restaurer les volumes Docker

Sur le VPS :

```bash
cd /opt/assistant-xavier
docker compose --profile public down

docker volume rm assistant_data qdrant_data 2>/dev/null || true
docker volume create assistant_data
docker volume create qdrant_data

docker run --rm -v assistant_data:/data -v /tmp:/backup alpine:3.20 sh -c "tar -xzf /backup/assistant-data-YYYYMMDD-HHMMSS.tgz -C /data"
docker run --rm -v qdrant_data:/data -v /tmp:/backup alpine:3.20 sh -c "tar -xzf /backup/qdrant-data-YYYYMMDD-HHMMSS.tgz -C /data"
```

## 5. Restaurer PostgreSQL

Sur le VPS :

```bash
docker compose --profile public up -d postgres
sleep 10
cat /tmp/postgres-YYYYMMDD-HHMMSS.sql | docker exec -i assistant-postgres psql -U assistant assistant_xavier
```

## 6. Relancer l'application

```bash
docker compose --profile public up -d --build
docker compose ps
```

Verifier :

```text
https://vps-b6bb35e6.vps.ovh.net/api/health
https://vps-b6bb35e6.vps.ovh.net/api/sync/status
```

## Notes

- Ne jamais restaurer au hasard trois fichiers avec des horodatages differents.
- Garder les sauvegardes OneDrive et, plus tard, ajouter une deuxieme destination externe.
- Si les connexions Google ne reviennent pas, reconnecter les services depuis l'onglet Connexions.

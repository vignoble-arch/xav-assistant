# Workflows n8n

## Acces

- Interface : `https://vps-b6bb35e6.vps.ovh.net/n8n`
- Le compte n8n sert a voir, tester et modifier les workflows.
- Les webhooks publics n8n restent accessibles sans ouvrir l'interface.

## Workflows actifs

### Baqio vers Assistant Xavier - commandes

Recoit les commandes Baqio au fil de l'eau.

URL a utiliser cote Baqio :

```text
https://vps-b6bb35e6.vps.ovh.net/n8n/webhook/baqio-commandes
```

Securite :

```text
x-order-webhook-secret: VOTRE_SECRET
```

Effet :

- verifie le secret ;
- normalise la commande ;
- transmet a Assistant Xavier en interne ;
- cree ou met a jour le suivi de commande ;
- previent Fernand, Gaspard, Suzette et Paulo via le suivi des demandes.

### Assistant Xavier - Synchronisation Google reguliere

Toutes les 30 minutes, n8n demande a Assistant Xavier de synchroniser Google.

Effet :

- emails ;
- agenda ;
- taches ;
- comptes Gmail connectes.

### Assistant Xavier - Synchronisation Baqio quotidienne

Chaque matin a 06h20, n8n demande a Assistant Xavier de synchroniser Baqio.

Effet :

- clients ;
- commandes ;
- statistiques commerciales ;
- contexte utile pour Gaspard et Fernand.

## Workflow de test

### TEST - Envoyer une commande a Assistant Xavier

Workflow manuel et inactif.

Il sert uniquement a envoyer une fausse commande de test si on veut verifier la chaine sans attendre Baqio.

## Sauvegarde

Depuis PowerShell, dans le dossier du projet :

```powershell
powershell -ExecutionPolicy Bypass -File ".\ops\export-n8n-workflows.ps1"
```

La sauvegarde est creee dans :

```text
backups\n8n-workflows
```

Elle contient les workflows n8n exportes depuis le VPS.

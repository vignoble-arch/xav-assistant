# OpenAI API pour Assistant Xavier

## Modele recommande

Modele par defaut :

```text
gpt-5.4-mini
```

Ce choix donne un bon compromis entre qualite, vitesse et cout pour Assistant Xavier.

## Activer OpenAI sur le VPS

1. Creer une cle API OpenAI depuis le tableau de bord OpenAI.
2. Lancer dans PowerShell :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\configure-openai-vps.ps1"
```

3. Coller la cle API quand PowerShell la demande.

La cle ne s'affiche pas a l'ecran.

## Activer OpenAI en local

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\configure-openai-local.ps1"
```

## Garder Gemma en secours

Gemma reste disponible sur le PC via LM Studio. Si OpenAI est coupe ou si on veut economiser, on peut revenir au pont Gemma.

## Cout

L'application garde un compteur de tokens et une estimation de cout dans l'onglet `Memoire`.

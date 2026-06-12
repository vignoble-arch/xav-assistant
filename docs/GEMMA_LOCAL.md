# Gemma local via LM Studio

## Principe

Gemma tourne sur le PC dans LM Studio.

Le VPS reste le serveur principal de l'application, mais il appelle Gemma par un pont SSH inverse :

```text
Assistant Xavier VPS -> port VPS 1235 -> pont SSH -> LM Studio PC port 1234
```

Cette solution evite d'ouvrir LM Studio sur Internet.

## Etat actuel

- Modele local : `google/gemma-4-12b`
- LM Studio local : `http://127.0.0.1:1234/v1`
- Pont VPS : `http://host.docker.internal:1235/v1`
- App VPS configuree sur : `AI_PROVIDER=lmstudio`

## Relancer apres redemarrage du PC

1. Ouvrir LM Studio.
2. Charger le modele `google/gemma-4-12b`.
3. Lancer le pont :

```powershell
cd "C:\Users\vigno\OneDrive\Documents\nouveau projet"
powershell -ExecutionPolicy Bypass -File ".\ops\start-gemma-bridge.ps1"
```

Garder cette fenetre ouverte tant que le VPS doit utiliser Gemma.

## Verification

Dans l'app, onglet `Connexions`, cliquer sur `Tester l'IA`.

Le modele attendu est :

```text
google/gemma-4-12b
```

## Limites

- Si le PC dort, s'eteint ou perd Internet, l'IA du VPS ne repond plus.
- Le pont doit etre relance apres un redemarrage.
- Cette solution est parfaite pour tester gratuitement, mais une API OpenAI restera plus stable pour un assistant disponible 24/7.

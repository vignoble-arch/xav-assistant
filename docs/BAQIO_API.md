# Baqio API

Source officielle : https://github.com/Baqio/api-doc

## Acces

- Production : `https://app.baqio.com/api/v1`
- Demo : `https://demo.baqio.com/api/v1`
- HTTPS obligatoire.
- Reponses JSON UTF-8.

## Identifiants

Baqio demande trois informations creees dans Baqio, dans Parametres > Mon compte > Cles API :

- `api_key`
- `password`
- `secret`

L'application stocke ces valeurs dans le fichier prive serveur `data/runtime.env`, jamais dans GitHub.

## Authentification

Les appels utilisent une authentification Basic :

```text
Authorization: Basic base64(api_key:password)
Accept: application/json
Content-Type: application/json
```

Les requetes `POST` doivent aussi etre signees avec le secret dans le header :

```text
X-Baqio-Hmac-Sha256
```

La signature est calculee en HMAC SHA256 sur le body JSON envoye.

## Premiers endpoints utiles

- `GET /customers` : liste des clients.
- `GET /customers/{id}` : detail client.
- `GET /orders` : liste des commandes, paginee par 50 avec `page`.
- `POST /customers` : creation client, avec signature.
- `POST /orders` : creation ou mise a jour de commande par reference, avec signature.

## Usage prevu dans Assistant Xavier

V1 :

- verifier les identifiants Baqio ;
- preparer la lecture clients et commandes ;
- alimenter l'agent commercial avec les derniers achats, categories client et relances possibles.

## Profondeur de synchronisation

L'application peut regler le nombre de pages Baqio a lire.

- 1 page = environ 50 lignes.
- 10 pages = environ 500 clients et 500 commandes.
- 30 pages = environ 1500 clients et 1500 commandes.
- Maximum prevu dans l'application : 200 pages.

Le reglage se fait dans Connexions > Baqio > Pages a synchroniser.

Etape suivante :

- importer les clients en lecture seule ;
- analyser professionnels / particuliers ;
- preparer des relances commerciales sans envoyer d'action sans validation de Xavier.

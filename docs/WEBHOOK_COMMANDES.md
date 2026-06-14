# Webhook commandes

## Objectif

Recevoir les commandes au fil de l'eau depuis n8n, Baqio ou un autre outil, puis les mettre dans le suivi operationnel des assistants.

## URL conseillee avec n8n

Pour Baqio, utiliser n8n comme sas de securite :

```text
https://vps-b6bb35e6.vps.ovh.net/n8n/webhook/baqio-commandes
```

Ajouter l'en-tete :

```text
x-order-webhook-secret: VOTRE_SECRET
```

n8n verifie ce secret, normalise la commande, puis transmet a Assistant Xavier en interne.

## URL directe de l'application

```text
https://vps-b6bb35e6.vps.ovh.net/api/webhooks/orders
```

Cette URL reste disponible pour un test direct ou un outil qui ne passe pas par n8n.

## Securite

Ajouter un en-tete HTTP avec le secret configure dans l'application :

```text
x-order-webhook-secret: VOTRE_SECRET
```

Le secret se configure dans l'application, section Connexions > Baqio > Secret webhook commandes.

## Statuts acceptes

- En commande
- Prete pour expedition
- En livraison
- Expedie

Le webhook accepte aussi quelques variantes simples comme `ready`, `shipped`, `delivery`, mais il vaut mieux envoyer les statuts ci-dessus.

## Exemple JSON

```json
{
  "id": "CMD-2026-001",
  "reference": "CMD-2026-001",
  "customerName": "Client exemple",
  "status": "En commande",
  "deliveryDate": "2026-06-15",
  "deliveryAddress": "1 rue de la Cave",
  "deliveryZip": "84110",
  "deliveryCity": "Vaison-la-Romaine",
  "totalCents": 12400,
  "items": [
    {
      "name": "Carton rouge",
      "quantity": 2
    }
  ],
  "source": "n8n"
}
```

## Effet dans l'application

- La commande apparait dans Commercial > Commandes en cours.
- Une demande assistant est creee ou mise a jour pour Fernand, Gaspard, Suzette et Paulo.
- Gaspard et Fernand voient les commandes en cours dans leur contexte IA.
- Quand le statut passe a `Expedie`, la commande est consideree comme close.

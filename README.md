# Appli Automatisation

Une appli qui regroupe des automatisations sur mesure pour les restaurants. Chaque
client (restaurant) a ses propres automatisations activées et ses propres données.

**Première automatisation : le suivi des prix fournisseurs.**
Le restaurant nous transmet ses factures (PDF ou photo). Claude lit chaque ligne,
l'appli retrouve l'historique de prix de chaque produit et prévient dès qu'un
fournisseur augmente un prix, avec le surcoût estimé en euros par mois et par an.
Un rapport prêt à envoyer par WhatsApp ou email est généré automatiquement.

- **Plusieurs factures d'un coup** : pratique pour importer l'historique d'un nouveau client.
- **Factures photographiées page par page** : les pages d'une même facture sont réunies,
  une page envoyée deux fois est refusée.
- **Corriger une ligne mal lue** en un clic, puis marquer la facture comme vérifiée.
- **Page par produit** avec le graphique de son prix dans le temps.

Prochaines automatisations prévues (déjà visibles dans le catalogue) : réponses aux
avis Google, post du plat du jour sur Instagram et Facebook.

## Lancer l'appli sur son ordinateur

Il faut [Node.js](https://nodejs.org) 22 ou plus récent.

```bash
npm install
cp .env.example .env.local   # puis remplir les valeurs (voir ci-dessous)
npm run dev
```

Ouvrir ensuite http://localhost:3000 et cliquer sur **« Ouvrir la démo »** : un
restaurant fictif avec 12 semaines de factures et 5 hausses cachées apparaît.
La démo fonctionne sans aucune clé ni base de données.

### Les réglages (`.env.local`)

| Variable | À quoi ça sert | Obligatoire ? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Lire de vraies factures avec Claude. Clé à créer sur https://console.anthropic.com | Pour les vraies factures |
| `APP_PASSWORD` | Mot de passe pour entrer dans l'appli | Oui, une fois en ligne |
| `DATABASE_URL` | Base Postgres en ligne (par exemple Supabase). Vide = base locale dans `.data/` | Une fois en ligne |
| `CLAUDE_MODEL` | Modèle Claude utilisé (par défaut `claude-opus-5-5`) | Non |

**Coût de lecture** : environ 5 à 10 centimes par facture (estimation). Pour un
restaurant qui reçoit 40 factures par mois, cela fait 2 à 4 € par mois.

## Mettre l'appli en ligne

1. Créer une base gratuite sur [Supabase](https://supabase.com) et copier sa chaîne
   de connexion (« Connection string », mode *Transaction pooler*) dans `DATABASE_URL`.
2. Importer ce dépôt GitHub sur [Vercel](https://vercel.com).
3. Dans Vercel, ajouter les variables `ANTHROPIC_API_KEY`, `APP_PASSWORD` et `DATABASE_URL`.

Les tables sont créées automatiquement au premier démarrage. Sans `APP_PASSWORD`,
l'appli en ligne reste verrouillée, pour que les données des clients ne soient
jamais publiques par erreur.

## Comment c'est construit

```
src/
  app/                        Pages (Next.js) et actions communes
  platform/                   Le socle commun à toutes les automatisations
    modules.ts                  Catalogue des automatisations et de leurs commandes
    organizations.ts            Clients et automatisations activées pour chacun
    commands.ts                 runCommand : chaque commande est tracée (succès, erreur, durée)
    db.ts, schema.ts            Base de données (PGlite en local, Postgres en ligne)
    auth.ts, session.ts         Mot de passe d'accès
  modules/
    panels.tsx                  Écran de chaque automatisation
    suivi-prix-fournisseurs/    La première automatisation
      extract.ts                  Envoi de la facture à Claude
      invoice-draft.ts            Contrôles de la lecture (totaux, dates, lignes douteuses)
      analyze.ts                  Détection des hausses et calcul du surcoût
      report.ts                   Rapport texte pour le restaurateur
      demo.ts                     Données du restaurant fictif
```

**La précision avant tout.** Claude lit la facture, mais le code vérifie derrière :
quantité × prix = montant de la ligne, somme des lignes = total HT (recalculée après
chaque correction ou page ajoutée), date valide, unité reconnue, facture déjà
importée… Tout ce qui ne colle pas est signalé « À vérifier ». Le calcul des hausses
n'utilise pas d'IA : c'est du code testé.

Si un filtre de sécurité de Claude refusait de lire un document, l'API réessaie
automatiquement avec le modèle de secours recommandé par Anthropic.

### Ajouter une automatisation

1. Ajouter une entrée dans `src/platform/modules.ts` (nom, description, commandes).
2. Créer son dossier `src/modules/<id>/` : logique, actions, écran.
3. Brancher son écran dans `src/modules/panels.tsx`.
4. Faire passer chaque exécution par `runCommand` pour qu'elle apparaisse dans
   l'historique du client.

## Vérifier que tout marche

```bash
npm test            # tests (logique et vraie base de données)
npm run lint        # style du code
npm run typecheck   # types TypeScript
npm run build       # compilation de production
```

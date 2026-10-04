@AGENTS.md

# Appli Automatisation

Plateforme d'automatisations pour restaurants (multi-clients). Voir README.md pour
l'architecture. Points à respecter :

- Interface et messages en français ; code (identifiants) en anglais.
- Une automatisation = un module : entrée dans `src/platform/modules.ts`, dossier
  `src/modules/<id>/`, écran dans `src/modules/panels.tsx`. Ne pas mettre de logique
  propre à un module dans `src/platform/`.
- Toute exécution d'une commande passe par `runCommand` (historique par client).
- Chaque action serveur commence par `requireAuth()` et vérifie que l'objet
  appartient bien au client (`organization_id` dans chaque requête).
- SQL brut via `getDb()` (PGlite en local, Postgres via `DATABASE_URL`). Le schéma
  est dans `src/platform/schema.ts`, idempotent.
- Les calculs (détection de hausses, contrôles) restent du code pur et testé ;
  l'IA ne sert qu'à lire les documents.
- Avant de pousser : `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

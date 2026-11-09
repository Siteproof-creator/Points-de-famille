# Base de données (Supabase)

Ce dossier contient `schema.sql` : toute la base de données de l'application (tables, règles de sécurité, photos, fonctions pour créer/rejoindre une famille).

## À faire une seule fois

1. Sur supabase.com, ouvre ton projet, puis le menu **SQL Editor**.
2. Crée une nouvelle requête, colle **tout** le contenu de `schema.sql`, puis appuie sur **Run**.
   Le message « Success. No rows returned » est normal.
3. Menu **Authentication**, puis **Sign In / Providers**, puis active **Allow anonymous sign-ins**.
   C'est ce qui permet à chaque téléphone de rester connecté sans compte ni mot de passe.
4. Menu **Project Settings**, puis **API Keys** : vérifie que l'adresse du projet et la clé `sb_publishable_…` sont bien celles de `www/config.js`.

N'exécute `schema.sql` qu'une fois : relancé sur une base déjà installée, il affichera des erreurs « already exists ».

## Ce que la sécurité garantit (règles RLS)

- Une famille ne voit jamais les données d'une autre famille.
- Un enfant ne peut ni créer des tâches, ni valider des points, ni choisir librement le nombre de points : ils viennent de la tâche choisie par l'adulte.
- Une demande d'enfant doit avoir une photo ; les photos ne sont lisibles que par les adultes de la famille.
- Le dernier adulte d'une famille ne peut pas être supprimé ni rétrogradé.
- Le code de famille n'est lisible que par les adultes, et les essais de codes sont limités (10 échecs par 10 minutes).

## Bon à savoir

- Sur l'offre gratuite de Supabase, un projet inactif pendant 7 jours est mis en pause (l'application ne marche plus jusqu'à sa réactivation). Pour une application publiée, prévois l'offre payante.
- Dans **Authentication → Attack Protection**, tu peux activer un CAPTCHA pour limiter la création massive de comptes anonymes.

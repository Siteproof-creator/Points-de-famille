# Points de famille

Application familiale : les enfants envoient une photo de la tâche faite, les adultes valident, les points s'accumulent, classement entre tous les membres, boutique de récompenses.
Fonctionne comme site web (iPhone, PC) et comme application iPhone (App Store) grâce à Capacitor. Données : Supabase.

> Tu es sur **Windows** : tu n'as besoin ni de Mac ni d'Xcode. **GitHub construit l'application iPhone pour toi** (sur un Mac loué par GitHub).

## Ce que contient le projet

| Dossier / fichier | Rôle |
|---|---|
| `www/` | L'application (HTML, CSS, JavaScript), politique de confidentialité `privacy.html`, icônes |
| `supabase/schema.sql` | Toute la base de données et sa sécurité |
| `.github/workflows/pages.yml` | Publie le site web gratuitement (GitHub Pages) |
| `.github/workflows/ios.yml` | Construit l'app iPhone et l'envoie sur TestFlight / App Store Connect |
| `scripts/` | Outils utilisés par ces automatismes |
| `tests/` | Tests automatiques (facultatif) |
| `store/metadata.fr.md` | Textes et réponses à copier dans App Store Connect |
| `docs/APP_STORE.md` | Guide Apple pas à pas |

## Étapes, dans l'ordre

### 1. Mettre le projet sur GitHub
1. Crée un compte sur github.com si besoin, puis **New repository** : nom `points-de-famille`, **Public** (nécessaire pour GitHub Pages gratuit), sans README.
2. Dézippe ce ZIP sur ton PC. Dans le dépôt vide, clique **uploading an existing file** et glisse **tout le contenu du dossier** (y compris le dossier caché `.github`, voir ci-dessous), puis **Commit changes**.
   - Le dossier `.github` est caché sous Windows : dans l'Explorateur, onglet **Affichage → Afficher → Éléments masqués**. Si GitHub ne le prend pas par glisser-déposer, installe **GitHub Desktop** (desktop.github.com), ajoute le dossier comme dépôt local et fais **Publish repository** : il envoie tout, fichiers cachés compris.
3. Vérifie sur GitHub que tu vois bien `.github/workflows/ios.yml` et `pages.yml`.

### 2. Installer la base de données (Supabase)
Suis `supabase/README.md` : coller `schema.sql` dans le SQL Editor, puis activer **Allow anonymous sign-ins**. Sans cela, l'application affiche une erreur de connexion.

### 3. Publier le site web
Dans le dépôt GitHub : **Settings → Pages → Source : GitHub Actions**. Puis onglet **Actions → Site web → Run workflow**. Après 2-3 minutes, l'adresse est `https://TON-COMPTE.github.io/points-de-famille/`.
Ouvre-la sur ton iPhone : l'application fonctionne déjà (Safari → Partager → Sur l'écran d'accueil).

### 4. Politique de confidentialité (obligatoire pour l'App Store)
1. Dans `www/privacy.html`, remplace les textes entre crochets (éditeur, e-mail, région Supabase) (modifier un fichier directement sur GitHub : crayon ✏️). Relis le texte : c'est un modèle, tu en es responsable.
2. Dans `www/config.js`, mets `privacyUrl: 'https://TON-COMPTE.github.io/points-de-famille/privacy.html'`.

### 5. Publier sur l'App Store
Suis `docs/APP_STORE.md` (compte Apple Developer, fiche de l'app, clé API, secrets GitHub, lancement du workflow iOS). Les textes sont dans `store/metadata.fr.md`.

## Tester sur ton PC (facultatif)
Il faut Node.js 20+. `npm install`, `npm run vendor`, `npm start` puis ouvre http://localhost:8080.

## Fonctionnalités (toutes conservées)
Création de famille et code de famille · rôles adulte/enfant définis par l'adulte · rejoindre depuis un autre appareil avec prénom + code · tâches définies par les adultes avec points fixes · l'enfant choisit une tâche et envoie une photo · validation / refus par un adulte · points manuels (+/−) · classement semaine / mois / total · boutique de récompenses et demandes d'échange · historique · thème clair/sombre style « liquid glass » · synchronisation en direct · suppression de la famille et de ses données.

## Limites connues
- Le build iOS et la validation Apple n'ont **pas** pu être testés dans l'environnement où ce projet a été préparé (pas de Mac). Le premier lancement du workflow peut demander un ajustement : copie le message d'erreur et demande de l'aide.
- Offre gratuite Supabase : projet mis en pause après 7 jours d'inactivité.
- Apple peut refuser une app trop proche d'un « site web empaqueté » (règle 4.2). L'appareil photo, la synchronisation et la validation par photo aident, mais rien n'est garanti.

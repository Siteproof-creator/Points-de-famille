# Publier sur l'App Store depuis Windows

Coût : **99 €/an** (Apple Developer Program). Délai : l'inscription peut prendre de quelques heures à quelques jours ; la validation d'une app, en général 1 à 2 jours.

## A. Compte Apple Developer
1. Va sur developer.apple.com/programs et inscris-toi (identifiant Apple avec double authentification, paiement).
2. Note ton **Team ID** (developer.apple.com → Compte → Appartenance : 10 caractères).

## B. Choisir l'identifiant de l'application
1. Dans `capacitor.config.json`, remplace `fr.pointsdefamille.app` par un identifiant à toi, unique au monde, du type `com.tonnom.pointsdefamille` (minuscules, sans espace). Il ne pourra plus changer.
2. developer.apple.com → **Certificates, Identifiers & Profiles → Identifiers → +** → App IDs → App → saisis le même identifiant (Explicit). Aucune capacité à cocher.

## C. Créer la fiche dans App Store Connect
1. appstoreconnect.apple.com → **Apps → + → Nouvelle app** : plateforme iOS, nom « Points de famille », langue Français, identifiant = celui de l'étape B, SKU = `points-de-famille`.
2. Remplis la fiche avec `store/metadata.fr.md` (description, mots-clés, URLs, âge, confidentialité, notes pour Apple).

## D. Clé API App Store Connect
1. App Store Connect → **Utilisateurs et accès → Intégrations → Clés App Store Connect → +** : nom « GitHub », accès **Admin** (ou « Gestionnaire d'app »).
2. Télécharge le fichier `AuthKey_XXXX.p8` (**une seule fois possible**, garde-le en lieu sûr, ne le mets jamais dans GitHub).
3. Note l'**ID de la clé** et l'**Issuer ID** (en haut de la page).

## E. Secrets GitHub
Dépôt → **Settings → Secrets and variables → Actions → New repository secret** :

| Nom | Valeur |
|---|---|
| `APPLE_TEAM_ID` | ton Team ID |
| `ASC_KEY_ID` | l'ID de la clé |
| `ASC_ISSUER_ID` | l'Issuer ID |
| `ASC_KEY_P8` | le **contenu complet** du fichier .p8 (ouvre-le avec le Bloc-notes, copie tout, y compris les lignes BEGIN/END) |

## F. Construire et envoyer
1. Onglet **Actions → iOS - envoyer sur TestFlight → Run workflow** (version 1.0).
2. Attends 10 à 25 minutes. En cas d'échec, ouvre l'exécution, copie les dernières lignes rouges et demande de l'aide.
3. Dans App Store Connect → ton app → **TestFlight** : la version apparaît après traitement (quelques minutes). Installe l'app **TestFlight** sur ton iPhone pour la tester avant publication.

## G. Soumettre à la validation
1. App Store Connect → ton app → version 1.0 → section **Build** : choisis le build envoyé.
2. Ajoute les **captures d'écran** iPhone 6,9" (1320 × 2868) : tu peux les faire dans TestFlight (bouton volume + côté) avec une famille fictive.
3. Renseigne : URL de confidentialité, notes pour la validation (compte de test inutile : voir `store/metadata.fr.md`), questionnaire d'âge, confidentialité de l'app.
4. **Ajouter pour vérification**, puis **Soumettre**.

## Pour les mises à jour
Modifie les fichiers sur GitHub, relance le workflow iOS avec un numéro de version supérieur si besoin, puis crée une nouvelle version dans App Store Connect. Chaque exécution reçoit automatiquement un numéro de build unique.

## Si Apple refuse
Les motifs fréquents : app trop proche d'un site web (4.2), politique de confidentialité manquante ou fausse, impossibilité de tester (vérifie les notes), données d'enfants. Réponds dans le Centre de résolution en expliquant les fonctions natives (photo, synchronisation) et la suppression des données.

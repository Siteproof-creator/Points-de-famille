# Fiche App Store (à copier dans App Store Connect)

## Informations de base
- **Nom** (30 caractères max) : Points de famille
- **Sous-titre** (30 max) : Tâches, points et récompenses
- **Catégorie principale** : Style de vie (secondaire : Productivité)
- **Langue principale** : Français
- **Prix** : Gratuit
- **Version** : 1.0
- **Droits d'auteur** : 2026 [TON NOM]

## Texte promotionnel (170 max, modifiable sans nouvelle version)
Les enfants envoient une photo de la tâche faite, les parents valident, les points s'accumulent et ouvrent des récompenses : film du soir, argent de poche…

## Description
Points de famille transforme les tâches du quotidien en jeu pour toute la famille.

LES PARENTS
• Créent la famille et ajoutent chaque membre avec son prénom, enfant ou adulte
• Fixent les tâches et le nombre de points de chacune
• Valident ou refusent les demandes en voyant la photo
• Ajoutent ou retirent des points quand ils le souhaitent
• Créent les récompenses et le nombre de points nécessaires

LES ENFANTS
• Choisissent la tâche accomplie dans la liste, sans rien écrire
• Prennent une photo et l'envoient à un adulte
• Les points ne comptent qu'une fois la tâche validée
• Suivent leur progression vers la prochaine récompense
• Demandent une récompense quand ils ont assez de points

POUR TOUS
• Un classement entre tous les membres : semaine, mois ou total
• Rejoindre la famille depuis un autre téléphone avec juste son prénom et le code de la famille
• Synchronisation en direct entre les appareils
• Aucune publicité, aucun suivi
• Les photos sont supprimées dès que l'adulte a répondu
• Les adultes peuvent supprimer la famille et toutes ses données à tout moment

## Mots-clés (100 caractères max, séparés par des virgules, sans espace)
famille,points,tâches,enfants,récompenses,argent de poche,corvées,classement,parents,motivation

## URL d'assistance
L'adresse de ton site GitHub Pages (par exemple https://TON-COMPTE.github.io/points-de-famille/) ou une page de contact.

## URL de politique de confidentialité
https://TON-COMPTE.github.io/points-de-famille/privacy.html

## Classification par âge (questionnaire)
Aucune violence, contenu sexuel, jeu d'argent, médicaments, etc. : réponds « Non » partout. L'application n'a pas de messagerie entre utilisateurs ni de navigation web libre. Résultat attendu : 4+. (À vérifier dans le questionnaire, Apple décide du résultat.)
Ne coche pas la « catégorie Enfants » : elle impose des règles très strictes. L'application s'adresse aux familles, c'est un adulte qui la configure.

## Confidentialité de l'app (étiquettes « App Privacy »)
Réponds « Oui, nous collectons des données », puis déclare :
- **Coordonnées → Nom** (les prénoms) : liée à l'utilisateur ; utilisée pour le fonctionnement de l'app ; pas utilisée pour le suivi.
- **Photos ou vidéos** : liées à l'utilisateur ; fonctionnement de l'app ; pas pour le suivi ; supprimées après validation.
- **Identifiants → ID utilisateur** (identifiant anonyme) : lié à l'utilisateur ; fonctionnement de l'app ; pas pour le suivi.
Pas de suivi (tracking), pas de publicité. Ces réponses sont à vérifier par toi : c'est toi qui engage ta déclaration.

## Notes pour l'équipe de validation Apple (App Review)
Aucun compte ni mot de passe n'est nécessaire. Pour tester :
1. Ouvrir l'app, toucher « Créer une famille », saisir un prénom (par exemple « Parent »). Le code de famille s'affiche dans l'onglet « Famille ».
2. Dans « Famille », ajouter un membre « Enfant » (rôle Enfant) et une tâche (par exemple « Ranger sa chambre », 5 points). Dans « Récompenses », ajouter une récompense.
3. Toucher « Quitter » en haut, puis « Rejoindre » : saisir le prénom « Enfant » et le code de famille. L'écran enfant s'ouvre : « Gagner des points », choisir la tâche, prendre une photo (ou en choisir une) et envoyer.
4. Se reconnecter comme « Parent » avec le prénom et le code, onglet « À valider » : voir la photo et valider.
La suppression des données se fait dans « Famille » → « Supprimer la famille et ses données ».

## Captures d'écran
À faire toi-même depuis TestFlight avec une famille fictive : format iPhone 6,9 pouces (1320 × 2868). Apple les redimensionne pour les autres tailles.

## Avant de soumettre : à compléter
- Remplace `[NOM OU PSEUDONYME DE L'ÉDITEUR]` et `[ADRESSE E-MAIL DE CONTACT]` dans `www/privacy.html`.
- Remplace `[RÉGION DU PROJET SUPABASE…]` (visible dans Supabase → Project Settings).
- Renseigne `privacyUrl` dans `www/config.js`.

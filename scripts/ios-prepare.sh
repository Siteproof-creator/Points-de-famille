#!/usr/bin/env bash
# Règle le projet iOS créé par « npx cap add ios » : icône, textes de permission, iPhone en portrait, iPad compatible.
# À lancer sur un Mac (GitHub Actions le fait pour toi).
set -euo pipefail

APP_DIR="ios/App"
PLIST="$APP_DIR/App/Info.plist"
ICON_DIR="$APP_DIR/App/Assets.xcassets/AppIcon.appiconset"

# Icône 1024 x 1024 (sans transparence)
ICON_FILE=$(python3 -c "import json;d=json.load(open('$ICON_DIR/Contents.json'));print(next(i['filename'] for i in d['images'] if 'filename' in i))")
cp resources/icon.png "$ICON_DIR/$ICON_FILE"

pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST" 2>/dev/null || true; }
# Pas de chiffrement spécial : évite la question « conformité à l'exportation » à chaque envoi
pb "Delete :ITSAppUsesNonExemptEncryption";  pb "Add :ITSAppUsesNonExemptEncryption bool false"
# Texte affiché quand l'application demande l'appareil photo
pb "Delete :NSCameraUsageDescription";       pb "Add :NSCameraUsageDescription string Pour prendre en photo la tâche terminée et l’envoyer à un adulte de la famille."
pb "Delete :NSPhotoLibraryUsageDescription"; pb "Add :NSPhotoLibraryUsageDescription string Pour choisir la photo de la tâche terminée à envoyer à un adulte de la famille."
pb "Set :CFBundleDisplayName Points de famille"
# iPhone en portrait uniquement
pb "Delete :UISupportedInterfaceOrientations"
pb "Add :UISupportedInterfaceOrientations array"
pb "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait"

# iPad : toutes les orientations (exigé par Apple pour une app iPad)
pb "Delete :UISupportedInterfaceOrientations~ipad"
pb "Add :UISupportedInterfaceOrientations~ipad array"
pb "Add :UISupportedInterfaceOrientations~ipad:0 string UIInterfaceOrientationPortrait"
pb "Add :UISupportedInterfaceOrientations~ipad:1 string UIInterfaceOrientationPortraitUpsideDown"
pb "Add :UISupportedInterfaceOrientations~ipad:2 string UIInterfaceOrientationLandscapeLeft"
pb "Add :UISupportedInterfaceOrientations~ipad:3 string UIInterfaceOrientationLandscapeRight"

# iPhone + iPad
sed -i '' 's/TARGETED_DEVICE_FAMILY = 1;/TARGETED_DEVICE_FAMILY = "1,2";/g' "$APP_DIR/App.xcodeproj/project.pbxproj"
echo "Projet iOS préparé."

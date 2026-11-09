#!/usr/bin/env bash
# Construit l'application iOS et l'envoie sur App Store Connect (TestFlight).
# Variables attendues (secrets GitHub) : APPLE_TEAM_ID, ASC_KEY_ID, ASC_ISSUER_ID ; la clé .p8 est dans ~/private_keys.
set -euo pipefail
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID manquant}" "${ASC_KEY_ID:?ASC_KEY_ID manquant}" "${ASC_ISSUER_ID:?ASC_ISSUER_ID manquant}"

KEY="$HOME/private_keys/AuthKey_${ASC_KEY_ID}.p8"
BUNDLE_ID=$(node -p "require('./capacitor.config.json').appId")
if [ -d ios/App/App.xcworkspace ]; then CONTAINER=(-workspace ios/App/App.xcworkspace); else CONTAINER=(-project ios/App/App.xcodeproj); fi
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

mkdir -p build
xcodebuild archive "${CONTAINER[@]}" -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/App.xcarchive "${AUTH[@]}" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" CODE_SIGN_STYLE=Automatic \
  MARKETING_VERSION="${APP_VERSION:-1.0}" CURRENT_PROJECT_VERSION="${GITHUB_RUN_NUMBER:-1}"

cat > build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
PLIST

xcodebuild -exportArchive -archivePath build/App.xcarchive -exportPath build/export \
  -exportOptionsPlist build/ExportOptions.plist "${AUTH[@]}"
echo "Envoi terminé : l'application apparaît dans App Store Connect > TestFlight après quelques minutes."

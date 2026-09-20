# akiles-capacitor

Lokale Capacitor-plugin rond de Akiles Mobile SDK (workstream E2 uit `spec-ios-app.md`; contract en besluiten in `spec-akiles-access.md`, onderbouwing in `discovery-akiles-app-toegang.md`). Geen npm-publicatie: de root `package.json` koppelt hem via `"akiles-capacitor": "file:capacitor-plugins/akiles"`, waardoor de Capacitor CLI hem als plugin herkent en in SPM-modus in `ios/App/CapApp-SPM/Package.swift` opneemt.

- **JS-contract:** `src/definitions.ts` (`initialize`, `getSession`, `refresh`, `clearSession`, `getGadgets`, `open`, event `openStatus`; foutcodes in `AkilesErrorCode`).
- **iOS:** `ios/Sources/AkilesPlugin` (Swift) plus `ios/AkilesSDK.xcframework` als SPM `binaryTarget` (tag `v2.6.0` van `github.com/akiles/akiles-ios`, zonder dSYMs; licentie in `ios/AkilesSDK-LICENSE.txt`). Geen CocoaPods.
- **Android:** `android/` (Java) met `app.akiles:sdk:2.6.0` uit `https://maven.akiles.app/release`.
- **Web:** elke methode wijst af met `NOT_AVAILABLE`.

Het member token komt binnen via `initialize({ token })`, gaat een keer naar de SDK en wordt nergens in de plugin bewaard of gelogd. Online-modus staat uit; deuren openen loopt uitsluitend via Bluetooth.

SDK-upgrade: nieuwe xcframework kopieren (mapnaam `ios-arm64/AkilesSDK.framework`, zie `Package.swift`), versie in `android/build.gradle` gelijk trekken, `npx cap sync`.

// swift-tools-version: 5.9
import PackageDescription

// Lokale Capacitor-plugin rond de Akiles Mobile SDK (workstream E2,
// spec-akiles-access.md). De Capacitor CLI neemt dit package in SPM-modus
// op in ios/App/CapApp-SPM/Package.swift (naam en product moeten gelijk
// zijn aan fixName("akiles-capacitor") = "AkilesCapacitor").
//
// AkilesSDK wordt alleen via CocoaPods gepubliceerd (binaire xcframework,
// geen Package.swift in akiles/akiles-ios). De xcframework van tag v2.6.0
// staat daarom hier gevendored als binaryTarget, zonder dSYMs. Upgrade:
// nieuwe xcframework uit die repo kopieren, mapnaam ios-arm64/AkilesSDK.framework
// aanhouden (in de repo van Akiles heet die map AKilesSDK.framework, met
// hoofdletter K, terwijl de Info.plist AkilesSDK.framework verwacht), en
// de versie in android/build.gradle gelijk houden.
let package = Package(
    name: "AkilesCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "AkilesCapacitor",
            targets: ["AkilesPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .binaryTarget(
            name: "AkilesSDK",
            path: "ios/AkilesSDK.xcframework"
        ),
        .target(
            name: "AkilesPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "AkilesSDK"
            ],
            path: "ios/Sources/AkilesPlugin",
            linkerSettings: [
                .linkedFramework("CoreBluetooth")
            ])
    ]
)

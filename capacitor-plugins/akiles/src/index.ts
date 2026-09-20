import { registerPlugin } from "@capacitor/core";
import type { AkilesPlugin } from "./definitions";

/**
 * Lokale Capacitor-plugin "Akiles" (workstream E2). Native implementaties:
 * ios/Sources/AkilesPlugin (Swift, AkilesSDK.xcframework als binaryTarget)
 * en android/src/main/java/nl/themovementclub/akiles (Java, app.akiles:sdk
 * via Maven). Op web geeft elke methode NOT_AVAILABLE terug.
 */
export const Akiles = registerPlugin<AkilesPlugin>("Akiles", {
  web: () => import("./web").then((m) => new m.AkilesWeb()),
});

export * from "./definitions";

"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { registerPushToken } from "@/lib/member/push-actions";

/**
 * Registreert voor native push-notificaties — alleen binnen de
 * Capacitor-native-shell (iOS/Android-app), nooit in de browser-PWA.
 * Web Push is hier bewust niet gebouwd; dit kanaal bestaat uitsluitend
 * voor de gewrapte app (Fase 2), los van Web Push of e-mail
 * (MailerLite/MailerSend).
 *
 * Rendert niets; puur een side-effect bij mount. Alleen gerenderd vanuit
 * src/app/app/layout.tsx, net als ServiceWorkerRegister.
 *
 * // COPY: confirm with Marlon — Firebase-project bestaat nog niet.
 * Voorstel: project-id `tmc-member-app`, weergavenaam "The Movement
 * Club", default Cloud-resource-locatie `europe-west4` (Nederland/
 * Eemshaven — FCM zelf is een wereldwijde dienst zonder regiokeuze,
 * dit bepaalt alleen waar eventuele latere Firebase-producten
 * (Firestore/Functions) hun data zouden opslaan). Eigenaarschap volgt
 * later, samen met de Apple/Google-developer-accounts.
 *
 * Nog te doen zodra dat project bestaat (niet hier gedaan — zou de
 * Android-build stilzwijgend breken voor iedereen zonder de echte
 * config-bestanden):
 *   1. google-services.json → android/app/
 *   2. GoogleService-Info.plist → ios/App/App/
 *   3. Google Services Gradle-plugin toevoegen aan android/build.gradle
 *      + android/app/build.gradle (com.google.gms:google-services)
 *   4. iOS: FirebaseMessaging-dependency + AppDelegate.swift-init
 *   5. APNs-authenticatiesleutel (.p8) uploaden in Firebase Console →
 *      Project Settings → Cloud Messaging (brugt iOS via FCM, één
 *      unified server-side verzendpad voor beide platforms — zie PR4)
 */
export function PushNotificationRegister() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListeners: (() => void) | undefined;

    (async () => {
      const registrationListener = await PushNotifications.addListener(
        "registration",
        (token) => {
          const platform = Capacitor.getPlatform();
          if (platform !== "ios" && platform !== "android") return;
          void registerPushToken(token.value, platform).catch((err) => {
            console.error("[push] registerPushToken failed", err);
          });
        },
      );

      const errorListener = await PushNotifications.addListener(
        "registrationError",
        (err) => {
          console.error("[push] registration error", err);
        },
      );

      removeListeners = () => {
        void registrationListener.remove();
        void errorListener.remove();
      };

      const permission = await PushNotifications.checkPermissions();
      let granted = permission.receive === "granted";
      if (permission.receive === "prompt") {
        const requested = await PushNotifications.requestPermissions();
        granted = requested.receive === "granted";
      }
      if (granted) {
        await PushNotifications.register();
      }
    })().catch((err) => {
      console.error("[push] setup failed", err);
    });

    return () => {
      removeListeners?.();
    };
  }, []);

  return null;
}

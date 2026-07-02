import "server-only";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side push-verzending via Firebase Cloud Messaging. Losstaand
 * kanaal van MailerLite/MailerSend (die blijven puur e-mail) — dekt
 * alleen de native Capacitor-app (device-tokens uit
 * tmc.device_push_tokens, geregistreerd door
 * PushNotificationRegister.tsx). Eén Firebase-project dekt zowel iOS als
 * Android (de APNs-sleutel wordt in de Firebase Console geüpload), dus
 * sendEachForMulticast() hierbeneden bereikt beide platforms tegelijk.
 *
 * Firebase-project bestaat nog niet (zie
 * src/components/capacitor/PushNotificationRegister.tsx voor het
 * naam-/regiovoorstel) — isPushConfigured() maakt dit een no-op tot
 * FIREBASE_SERVICE_ACCOUNT_KEY gezet is, zelfde patroon als
 * isAdminConfigured() in src/lib/supabase/admin.ts. Niets breekt aan de
 * bestaande e-mail-triggers zolang dat zo is.
 */
export function isPushConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
}

function getMessagingClient() {
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string,
    );
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getMessaging();
}

export interface PushNotificationInput {
  title: string;
  body: string;
  /** Alleen strings — FCM data-payload staat geen andere types toe. */
  data?: Record<string, string>;
}

/**
 * Stuurt naar alle geregistreerde devices van dit profiel. Ruimt tokens
 * op die FCM als niet-meer-geregistreerd terugmeldt (app verwijderd,
 * token verlopen) — voorkomt dat toekomstige sends daar blijven op
 * botsen. Throwt nooit, zelfde discipline als emitEvent()/sendEmail():
 * een gefaalde push mag de aanroepende cron/webhook niet breken.
 */
export async function sendPushToProfile(
  profileId: string,
  notification: PushNotificationInput,
): Promise<void> {
  if (!isPushConfigured()) return;

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("device_push_tokens")
      .select("token")
      .eq("profile_id", profileId);
    if (error) {
      console.error("[sendPushToProfile] token lookup failed", profileId, error);
      return;
    }
    const tokens = (rows ?? []).map((r) => r.token);
    if (tokens.length === 0) return;

    const messaging = getMessagingClient();
    const message: MulticastMessage = {
      tokens,
      notification: { title: notification.title, body: notification.body },
      data: notification.data,
    };
    const result = await messaging.sendEachForMulticast(message);

    const deadTokens: string[] = [];
    result.responses.forEach((r, i) => {
      if (r.success || !r.error) return;
      const code = r.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        deadTokens.push(tokens[i]);
      } else {
        console.error(
          "[sendPushToProfile] send failed",
          profileId,
          code,
          r.error.message,
        );
      }
    });

    if (deadTokens.length > 0) {
      await admin.from("device_push_tokens").delete().in("token", deadTokens);
    }
  } catch (err) {
    console.error("[sendPushToProfile] threw", profileId, err);
  }
}

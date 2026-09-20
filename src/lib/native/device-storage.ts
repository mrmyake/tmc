/**
 * Client-side geheugen van de native app voor de twee per-device
 * credentials die bij uitloggen opgeruimd moeten worden (E1,
 * spec-akiles-access.md). Alleen ids en het pushtoken, nooit de waarde
 * van een Akiles member token: die leeft na addSession() uitsluitend in de
 * SDK-cache.
 *
 *  - ACCESS_DEVICE_TOKEN_ID_KEY: het rij-id in tmc.access_device_tokens
 *    dat issueMyAccessDeviceToken() teruggeeft. Geen geheim; het
 *    Akiles-id blijft server-side.
 *  - PUSH_TOKEN_KEY: het FCM-registratietoken dat
 *    PushNotificationRegister.tsx bij registratie ontvangt.
 *
 * DeviceSignOutFields leest beide en zet ze als verborgen velden in het
 * uitlogformulier, zodat signOut() ze server-side kan intrekken. Op web
 * bestaan de sleutels niet en gebeurt er niets.
 *
 * localStorage kan ontbreken of gooien (privemodus, webview zonder
 * opslag); elke toegang zit daarom in try/catch en faalt stil.
 */

export const ACCESS_DEVICE_TOKEN_ID_KEY = "tmc_access_device_token_id";
export const PUSH_TOKEN_KEY = "tmc_push_token";

export function readDeviceValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDeviceValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Geen opslag: dan kan het uitlogpad dit toestel niet herkennen; de
    // nachtelijke sync en het ledenscherm blijven de vangnetten.
  }
}

export function clearDeviceValue(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Zie writeDeviceValue.
  }
}

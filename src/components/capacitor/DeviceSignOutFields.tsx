"use client";

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import {
  ACCESS_DEVICE_TOKEN_ID_KEY,
  PUSH_TOKEN_KEY,
  readDeviceValue,
} from "@/lib/native/device-storage";

/**
 * Verborgen velden in het uitlogformulier (E1, spec-akiles-access.md):
 * het pushtoken en het rij-id van het Akiles device-token van dit toestel,
 * gelezen uit localStorage, zodat signOut() ze server-side kan opruimen.
 *
 * Op web (Capacitor.isNativePlatform() false) en in de server-render is
 * de waarde null en rendert dit niets; useSyncExternalStore houdt de
 * hydration gelijk zonder setState in een effect. Zonder waarden geen
 * velden: signOut() slaat het opruimpad dan over.
 */

const noopSubscribe = () => () => {};

function useDeviceValue(key: string): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => (Capacitor.isNativePlatform() ? readDeviceValue(key) : null),
    () => null,
  );
}

export function DeviceSignOutFields() {
  const pushToken = useDeviceValue(PUSH_TOKEN_KEY);
  const accessTokenId = useDeviceValue(ACCESS_DEVICE_TOKEN_ID_KEY);

  return (
    <>
      {pushToken ? <input type="hidden" name="push_token" value={pushToken} /> : null}
      {accessTokenId ? (
        <input type="hidden" name="access_device_token_id" value={accessTokenId} />
      ) : null}
    </>
  );
}

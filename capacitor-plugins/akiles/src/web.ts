import { WebPlugin } from "@capacitor/core";
import type { AkilesErrorCode, AkilesGadget, AkilesPlugin } from "./definitions";

/**
 * Webimplementatie: de Akiles Mobile SDK bestaat alleen native, dus elke
 * methode wijst af met NOT_AVAILABLE. Zelfde foutvorm als de native
 * afwijzingen (code, message), zodat de aanroeper (E3) een pad heeft.
 * getSession en clearSession zijn de uitzondering: geen sessie op web is
 * geen fout.
 */
function notAvailable(method: string): Error & { code: AkilesErrorCode } {
  const err = new Error(
    `Akiles.${method} is alleen beschikbaar in de iOS- of Android-app`,
  ) as Error & { code: AkilesErrorCode };
  err.code = "NOT_AVAILABLE";
  return err;
}

export class AkilesWeb extends WebPlugin implements AkilesPlugin {
  async initialize(): Promise<{ sessionId: string }> {
    throw notAvailable("initialize");
  }

  async getSession(): Promise<{ sessionId: string | null }> {
    return { sessionId: null };
  }

  async refresh(): Promise<void> {
    throw notAvailable("refresh");
  }

  async clearSession(): Promise<void> {
    return;
  }

  async getGadgets(): Promise<{ gadgets: AkilesGadget[] }> {
    throw notAvailable("getGadgets");
  }

  async open(): Promise<{ method: "bluetooth" }> {
    throw notAvailable("open");
  }
}

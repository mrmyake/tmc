import { createHash } from "node:crypto";

/**
 * Zelfde hash als tmc._checkout_token_hash (sha256 over UTF-8, hex). De
 * pagina's gebruiken hem alleen voor lezen (GET van /welkom) en als
 * PII-vrije dedupe-sleutel voor payment_return_view; alle schrijfpaden
 * hashen in de database.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

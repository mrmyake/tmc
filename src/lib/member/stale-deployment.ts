/**
 * Herkenning van een verouderde client-build (fix/workout-logging). Na een
 * deploy tijdens een lopende workout kent de server de server action-id
 * van de oude bundel niet meer; Next.js meldt dan "Failed to find Server
 * Action. This request might be from an older or newer deployment." (14
 * keer gezien in de Vercel-logs sinds 2026-08-31). In productie kan Next de
 * tekst richting de client redigeren, dus dit is een best-effort check:
 * herkend betekent een specifieke banner, niet herkend betekent de
 * generieke foutafhandeling met dezelfde veiligheidsroute (waarden blijven
 * in de UI en in sessionStorage).
 */

const MARKERS = [
  "failed to find server action",
  "older or newer deployment",
];

function textOf(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const o = err as { message?: unknown; digest?: unknown; cause?: unknown };
    const parts = [o.message, o.digest].filter((v) => typeof v === "string") as string[];
    if (o.cause) parts.push(textOf(o.cause));
    return parts.join(" ");
  }
  return String(err);
}

export function isStaleDeploymentError(err: unknown): boolean {
  const text = textOf(err).toLowerCase();
  return MARKERS.some((m) => text.includes(m));
}

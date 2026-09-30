// Stub voor src/lib/push (zie hooks.mjs): verstuurt niets, registreert elke
// aanroep in globalThis.__sentPushes zodat een test kan tellen wie welke push
// krijgt en op de tekst kan toetsen.
export function isPushConfigured() {
  return true;
}

export async function sendPushToProfile(profileId, notification) {
  globalThis.__sentPushes ??= [];
  globalThis.__sentPushes.push({ profileId, ...notification });
}

// Stub voor @/lib/access/sync: registreert elke aanroep, kan op verzoek throwen.
export async function syncMembershipAccess(profileId) {
  const t = globalThis.__lifecycleTest;
  t.syncCalls.push(profileId);
  if (t.syncThrows) throw new Error("sync kapot");
  return { profileId, ok: true, outcome: "granted" };
}

export async function syncAllAccess() {
  throw new Error("syncAllAccess hoort hier niet aangeroepen te worden");
}

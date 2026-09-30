// Stub voor @/lib/mollie: alles slaagt tenzij de test iets anders zet.
const t = () => globalThis.__lifecycleTest;

export function isMollieConfigured() {
  return true;
}
export function getMollieClient() {
  return null;
}
export async function cancelMollieSubscription() {
  return t().mollie.cancelOk ?? true;
}
export async function deleteMollieCustomer() {
  return true;
}
export async function getMollieSubscriptionInfo() {
  return t().mollie.info ?? { status: "active", nextPaymentDate: "2026-10-28" };
}
export async function hasValidMollieMandate() {
  return t().mollie.mandateValid ?? true;
}
export async function updateMollieSubscriptionAmount() {
  return true;
}
export async function createMollieRecurringSubscription() {
  return t().mollie.createSub ?? { id: "sub_new" };
}

// Stub voor src/lib/admin/require-admin buiten een Next-request (zie hooks.mjs).
export async function requireAdmin() {
  return { ok: true, userId: process.env.TEST_ADMIN_ID };
}

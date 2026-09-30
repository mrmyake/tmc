// Stub voor @/lib/supabase/admin (service-role-client).
import { makeFrom } from "./query-builder.mjs";

export function isAdminConfigured() {
  return true;
}

export function createAdminClient() {
  const t = globalThis.__lifecycleTest;
  return {
    from: makeFrom((table, ops) => t.admin(table, ops)),
    rpc: async (name, args) => t.adminRpc(name, args),
  };
}

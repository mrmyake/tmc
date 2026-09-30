// Stub voor @/lib/supabase/server (cookie-client van de ingelogde gebruiker).
// rpc() geeft een chainable terug zodat ook `.rpc(...).select().maybeSingle()`
// (opzegactie lid) werkt; wordt hij direct geawait, dan komt het kale
// rpc-resultaat terug.
import { makeFrom } from "./query-builder.mjs";

export async function createClient() {
  const t = globalThis.__lifecycleTest;
  return {
    auth: {
      getUser: async () => ({ data: { user: t.user ?? null }, error: null }),
    },
    from: makeFrom((table, ops) => t.server(table, ops)),
    rpc(name, args) {
      const ops = [];
      const q = new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === "then") {
              const p = Promise.resolve().then(() => t.rpc(name, args, ops));
              return p.then.bind(p);
            }
            if (prop === "catch" || prop === "finally") return undefined;
            return (...a) => {
              ops.push({ op: String(prop), args: a });
              return q;
            };
          },
        },
      );
      return q;
    },
  };
}

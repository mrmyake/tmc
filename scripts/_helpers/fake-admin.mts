/**
 * Minimale fake Supabase-client voor de node:test-suites: chainable builder
 * die elke afgeronde call registreert en per call een antwoord uit `respond`
 * haalt. Gedeeld door scripts/check-in/ en scripts/attendance/. Geen
 * database, geen netwerk.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "rpc";
  chain: Array<[string, unknown[]]>;
}

export type Respond = (
  call: Call,
) => { data?: unknown; error?: unknown; count?: number } | undefined;

const CHAINABLE = [
  "select", "eq", "neq", "gte", "gt", "lt", "lte", "in", "is", "or", "order", "limit", "returns",
];

export function fakeAdmin(respond: Respond): { client: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  function builder(table: string) {
    const call: Call = { table, op: "select", chain: [] };
    const finish = () => {
      calls.push(call);
      return Promise.resolve(respond(call) ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {};
    for (const m of CHAINABLE) {
      b[m] = (...args: unknown[]) => {
        call.chain.push([m, args]);
        return b;
      };
    }
    for (const m of ["insert", "update", "delete"] as const) {
      b[m] = (...args: unknown[]) => {
        call.op = m;
        call.chain.push([m, args]);
        return b;
      };
    }
    b.maybeSingle = finish;
    b.single = finish;
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      finish().then(res, rej);
    return b;
  }
  const client = {
    from: builder,
    rpc: (name: string, args: unknown) => {
      const call: Call = { table: `rpc:${name}`, op: "rpc", chain: [[name, [args]]] };
      calls.push(call);
      return Promise.resolve(respond(call) ?? { data: { ok: true }, error: null });
    },
    auth: {
      admin: {
        createUser: async (args: unknown) => {
          const call: Call = { table: "auth.createUser", op: "insert", chain: [["createUser", [args]]] };
          calls.push(call);
          return respond(call) ?? { data: { user: { id: "new-user" } }, error: null };
        },
      },
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

export function chainArg(call: Call, method: string): unknown[] | undefined {
  return call.chain.find(([m]) => m === method)?.[1];
}

/** Waarde van een .eq("kolom", waarde) in de keten, of undefined. */
export function eqValue(call: Call, column: string): unknown {
  return call.chain.find(([m, args]) => m === "eq" && args[0] === column)?.[1][1];
}

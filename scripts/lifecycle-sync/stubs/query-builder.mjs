// Minimale nep-PostgREST-builder: elke methode is chainable, het resultaat
// komt uit de resolver die de test per client zet (op tabel en de reeks
// aanroepen). Thenable, zodat zowel `await q.select().eq()` als
// `await q.select().eq().maybeSingle()` werkt.
export function makeFrom(resolver) {
  return (table) => {
    const ops = [];
    const q = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") {
            const p = Promise.resolve().then(() => resolver(table, ops));
            return p.then.bind(p);
          }
          if (prop === "catch" || prop === "finally") return undefined;
          return (...args) => {
            ops.push({ op: String(prop), args });
            return q;
          };
        },
      },
    );
    return q;
  };
}

/** Handig in resolvers: de eerste `eq`-waarde voor een kolom. */
export function eqValue(ops, column) {
  const hit = ops.find((o) => o.op === "eq" && o.args[0] === column);
  return hit ? hit.args[1] : undefined;
}

export function hasOp(ops, name) {
  return ops.some((o) => o.op === name);
}

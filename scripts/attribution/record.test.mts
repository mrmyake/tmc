import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordLeadAttribution } from "../../src/lib/attribution/record.ts";

// recordLeadAttribution (spec-marketing-attribution.md): nooit throwen, geen
// rij zonder parameters, on conflict do nothing. Een nep-client vangt de
// upsert; de database-kant (unieke index, constraints, grants) staat in
// scripts/test-lead-attributions-db.sh.

type Call = { table: string; row: Record<string, unknown>; options: Record<string, unknown> };

function fakeAdmin(behaviour: { error?: { message: string } | null; throws?: boolean } = {}) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      return {
        upsert(row: Record<string, unknown>, options: Record<string, unknown>) {
          if (behaviour.throws) throw new Error("netwerk weg");
          calls.push({ table, row, options });
          return Promise.resolve({ data: null, error: behaviour.error ?? null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { admin, calls };
}

const SOURCE_ID = "0f1e2d3c-4b5a-4968-8777-66554433aabb";
const attribution = {
  gclid: "test123",
  utm_source: "google",
  utm_campaign: "test",
  landing_path: "/proefles?gclid=test123&utm_source=google&utm_campaign=test",
  analytics_consent: "granted",
};

function silence(fn: () => Promise<unknown>) {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => {
    console.error = original;
  });
}

test("schrijft een rij met alle velden, e-mail lowercase, on conflict do nothing", async () => {
  const { admin, calls } = fakeAdmin();
  const result = await recordLeadAttribution(
    { sourceType: "trial_booking", sourceId: SOURCE_ID, email: " Test@Example.NL ", attribution },
    { admin },
  );
  assert.equal(result, "inserted");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "lead_attributions");
  assert.deepEqual(calls[0].options, { onConflict: "source_type,source_id", ignoreDuplicates: true });
  assert.deepEqual(calls[0].row, {
    source_type: "trial_booking",
    source_id: SOURCE_ID,
    email: "test@example.nl",
    gclid: "test123",
    gbraid: null,
    wbraid: null,
    fbclid: null,
    utm_source: "google",
    utm_medium: null,
    utm_campaign: "test",
    utm_term: null,
    utm_content: null,
    landing_path: "/proefles?gclid=test123&utm_source=google&utm_campaign=test",
    analytics_consent: "granted",
  });
});

test("test c: zonder parameters geen insert", async () => {
  const { admin, calls } = fakeAdmin();
  assert.equal(
    await recordLeadAttribution(
      { sourceType: "trial_request", sourceId: SOURCE_ID, email: "a@b.nl", attribution: undefined },
      { admin },
    ),
    "skipped",
  );
  assert.equal(
    await recordLeadAttribution(
      { sourceType: "trial_request", sourceId: SOURCE_ID, email: "a@b.nl", attribution: { analytics_consent: "granted" } },
      { admin },
    ),
    "skipped",
  );
  assert.equal(calls.length, 0);
});

test("test g: een ongeldige lp valt weg, de rij komt er wel", async () => {
  const { admin, calls } = fakeAdmin();
  const result = await recordLeadAttribution(
    {
      sourceType: "trial_booking",
      sourceId: SOURCE_ID,
      email: "a@b.nl",
      attribution: { gclid: "test123", landing_path: "https://evil.example/proefles" },
    },
    { admin },
  );
  assert.equal(result, "inserted");
  assert.equal(calls[0].row.landing_path, null);
  assert.equal(calls[0].row.gclid, "test123");
});

test("test d: een databasefout wordt gelogd en komt nooit als throw terug", async () => {
  const { admin, calls } = fakeAdmin({ error: { message: 'relation "lead_attributions" does not exist' } });
  const result = await silence(() =>
    recordLeadAttribution(
      { sourceType: "trial_booking", sourceId: SOURCE_ID, email: "a@b.nl", attribution },
      { admin },
    ),
  );
  assert.equal(result, "failed");
  assert.equal(calls.length, 1);
});

test("test d: een throw uit de client wordt gevangen", async () => {
  const { admin } = fakeAdmin({ throws: true });
  const result = await silence(() =>
    recordLeadAttribution(
      { sourceType: "trial_booking", sourceId: SOURCE_ID, email: "a@b.nl", attribution },
      { admin },
    ),
  );
  assert.equal(result, "failed");
});

test("test d: zonder service-role env (createAdminClient throwt) ook geen throw", async () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const result = await silence(() =>
      recordLeadAttribution({ sourceType: "trial_booking", sourceId: SOURCE_ID, email: "a@b.nl", attribution }),
    );
    assert.equal(result, "failed");
  } finally {
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  }
});

test("ongeldig source_id of lege e-mail: geen insert, geen throw", async () => {
  const { admin, calls } = fakeAdmin();
  await silence(async () => {
    assert.equal(
      await recordLeadAttribution(
        { sourceType: "trial_booking", sourceId: "", email: "a@b.nl", attribution },
        { admin },
      ),
      "failed",
    );
    assert.equal(
      await recordLeadAttribution(
        { sourceType: "trial_booking", sourceId: SOURCE_ID, email: "  ", attribution },
        { admin },
      ),
      "failed",
    );
  });
  assert.equal(calls.length, 0);
});

test("test j: een dubbele aanroep stuurt twee keer dezelfde upsert met ignoreDuplicates", async () => {
  const { admin, calls } = fakeAdmin();
  const args = { sourceType: "trial_booking" as const, sourceId: SOURCE_ID, email: "a@b.nl", attribution };
  await recordLeadAttribution(args, { admin });
  await recordLeadAttribution(args, { admin });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.ignoreDuplicates, true);
    assert.equal(call.options.onConflict, "source_type,source_id");
  }
});

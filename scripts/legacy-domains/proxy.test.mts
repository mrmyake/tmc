import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleLegacyDomain, proxy, config } from "./load.mts";

const realWarn = console.warn;
const realEnv = { ...process.env };

beforeEach(() => {
  console.warn = () => {};
  delete process.env.GLOBAL_CONFIG;
  delete process.env.EDGE_CONFIG;
});

afterEach(() => {
  console.warn = realWarn;
  process.env = { ...realEnv };
});

const permanent = async () => ({ "ptloosdrecht.nl": "redirect_permanent" });
const HOOK_TARGET =
  "https://www.themovementclub.nl/prijzen?utm_source=ptloosdrecht&utm_medium=redirect";

function hooked(simulatedHost: string): NextRequest {
  return new NextRequest("https://preview.example.test/kosten", {
    headers: { "x-legacy-host-test": simulatedHost },
  });
}

test("testhook werkt op preview", async () => {
  process.env.VERCEL_ENV = "preview";
  (process.env as Record<string, string>).NODE_ENV = "production";
  const res = await handleLegacyDomain(hooked("ptloosdrecht.nl"), permanent);
  assert.equal(res?.status, 308);
  assert.equal(res?.headers.get("location"), HOOK_TARGET);
});

test("testhook werkt in development", async () => {
  delete process.env.VERCEL_ENV;
  (process.env as Record<string, string>).NODE_ENV = "development";
  const res = await handleLegacyDomain(hooked("www.ptloosdrecht.nl"), permanent);
  assert.equal(res?.status, 308);
});

test("testhook wordt genegeerd op productie", async () => {
  process.env.VERCEL_ENV = "production";
  (process.env as Record<string, string>).NODE_ENV = "production";
  const res = await handleLegacyDomain(hooked("ptloosdrecht.nl"), permanent);
  assert.equal(res, null);
});

test("testhook wordt genegeerd zonder VERCEL_ENV in een productiebuild", async () => {
  delete process.env.VERCEL_ENV;
  (process.env as Record<string, string>).NODE_ENV = "production";
  assert.equal(await handleLegacyDomain(hooked("ptloosdrecht.nl"), permanent), null);
});

test("niet-oude hosts: de legacy-check doet niets", async () => {
  for (const host of [
    "www.themovementclub.nl",
    "themovementclub.nl",
    "localhost:3000",
    "themovementclub-git-main-iljas-projects-8d5cabb3.vercel.app",
    "ptloosdrecht.nl.evil.test",
    "notptloosdrecht.nl",
  ]) {
    const res = await handleLegacyDomain(new NextRequest(`https://${host}/kosten`), permanent);
    assert.equal(res, null, host);
  }
});

test("proxy: oude host wordt afgehandeld vóór auth (geen Supabase nodig)", async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = await proxy(new NextRequest("https://ptloosdrecht.nl/kosten/"));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), HOOK_TARGET);
});

test("proxy: niet-oude host loopt door de bestaande flow (login-redirect)", async () => {
  // Onbereikbare Supabase: getUser geeft geen gebruiker, /app stuurt naar /login.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
  const res = await proxy(new NextRequest("https://www.themovementclub.nl/app/rooster"));
  assert.equal(res.status, 307);
  assert.equal(
    res.headers.get("location"),
    "https://www.themovementclub.nl/login?next=%2Fapp%2Frooster",
  );
});

test("matcher: bestaande items ongewijzigd, plus host- en headeritem", () => {
  const matcher = config.matcher as unknown[];
  assert.deepEqual(matcher.slice(0, 7), [
    "/app",
    "/app/:path*",
    "/checkin",
    "/checkin/:path*",
    "/kiosk",
    "/kiosk/:path*",
    "/login",
  ]);
  assert.deepEqual(matcher.slice(7), [
    {
      source: "/:path*",
      has: [
        {
          type: "host",
          value: "(www\\.)?(ptloosdrecht\\.nl|hormoonprofiel\\.com)",
        },
      ],
    },
    { source: "/:path*", has: [{ type: "header", key: "x-legacy-host-test" }] },
  ]);
});

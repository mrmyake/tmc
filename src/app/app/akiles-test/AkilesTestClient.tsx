"use client";

// TIJDELIJKE TESTPAGINA. Verdwijnt met workstream E3. Zie page.tsx.
//
// Bewust ruw: Engelse pluginmeldingen, foutcodes groot in beeld, een
// logregel per actie. De tokenwaarde staat alleen in het invoerveld en in
// het geheugen van deze component; hij wordt nergens gelogd, niet in
// localStorage gezet en niet naar de server teruggestuurd.

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Akiles, isAkilesError, type AkilesGadget } from "akiles-capacitor";
import {
  issueMyAccessDeviceToken,
  revokeMyAccessDeviceToken,
} from "@/lib/actions/access-devices";

interface ShownError {
  code: string;
  sdkCode?: string;
  reason?: string;
  message: string;
}

function toShownError(err: unknown): ShownError {
  if (isAkilesError(err)) {
    return {
      code: err.code,
      sdkCode: err.data?.sdkCode,
      reason: err.data?.reason,
      message: err.message,
    };
  }
  if (typeof err === "object" && err !== null && "message" in err) {
    const e = err as { code?: unknown; message?: unknown };
    return {
      code: typeof e.code === "string" ? e.code : "JS_ERROR",
      message: String(e.message),
    };
  }
  return { code: "JS_ERROR", message: String(err) };
}

export function AkilesTestClient() {
  const [token, setToken] = useState("");
  const [tokenRowId, setTokenRowId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [gadgets, setGadgets] = useState<AkilesGadget[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("klaar");
  const [error, setError] = useState<ShownError | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const platform = Capacitor.getPlatform();
  const native = Capacitor.isNativePlatform();

  const addLog = (line: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString("nl-NL")}  ${line}`, ...prev].slice(0, 60));

  useEffect(() => {
    let handle: { remove: () => Promise<void> } | undefined;
    Akiles.addListener("openStatus", (event) => {
      const pct = event.percent !== undefined ? ` ${Math.round(event.percent)}%` : "";
      setStatus(`open: ${event.status}${pct}`);
      addLog(`openStatus ${event.status}${pct}`);
    })
      .then((h) => {
        handle = h;
      })
      .catch(() => {
        // Op web bestaat de listener niet; geen probleem.
      });
    Akiles.getSession()
      .then(({ sessionId: id }) => {
        setSessionId(id);
        addLog(id ? `bestaande sessie ${id}` : "geen sessie op dit toestel");
      })
      .catch((err) => setError(toShownError(err)));
    return () => {
      void handle?.remove();
    };
  }, []);

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    setStatus(`${label}...`);
    addLog(`${label} gestart`);
    try {
      const result = await fn();
      setStatus(`${label}: ok`);
      addLog(`${label} ok`);
      return result;
    } catch (err) {
      const shown = toShownError(err);
      setError(shown);
      setStatus(`${label}: fout ${shown.code}`);
      addLog(`${label} FOUT ${shown.code}${shown.sdkCode ? ` (${shown.sdkCode})` : ""}: ${shown.message}`);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const fetchToken = () =>
    run("token ophalen", async () => {
      const issued = await issueMyAccessDeviceToken(
        platform === "android" ? "android" : "ios",
        `akiles-test ${platform}`,
      );
      if (!issued.ok) {
        throw { code: "SERVER", message: issued.error };
      }
      setToken(issued.token);
      setTokenRowId(issued.id);
      addLog(`token uitgegeven, rij ${issued.id} (waarde staat alleen in het veld)`);
    });

  const connect = () =>
    run("koppelen", async () => {
      const { sessionId: id } = await Akiles.initialize({ token: token.trim() });
      setSessionId(id);
      addLog(`sessie ${id}`);
      const { gadgets: list } = await Akiles.getGadgets();
      setGadgets(list);
      addLog(`${list.length} gadget(s)`);
    });

  const loadGadgets = () =>
    run("gadgets ophalen", async () => {
      const { gadgets: list } = await Akiles.getGadgets();
      setGadgets(list);
      addLog(`${list.length} gadget(s)`);
    });

  const refresh = () => run("verversen", () => Akiles.refresh());

  const open = (gadget: AkilesGadget) =>
    run(`open ${gadget.name}`, async () => {
      const result = await Akiles.open({ gadgetId: gadget.id });
      addLog(`deur open via ${result.method}`);
    });

  const clearSession = () =>
    run("sessie wissen", async () => {
      await Akiles.clearSession();
      setSessionId(null);
      setGadgets([]);
    });

  const revokeToken = () =>
    run("token intrekken", async () => {
      if (!tokenRowId) throw { code: "GEEN_RIJ", message: "Geen uitgegeven token-rij bekend op deze pagina" };
      const result = await revokeMyAccessDeviceToken(tokenRowId);
      if (!result.ok) throw { code: "SERVER", message: result.error };
      setTokenRowId(null);
      setToken("");
    });

  const button =
    "rounded border border-[#C9A86B] px-4 py-3 text-base font-medium text-[#F5F2EC] disabled:opacity-40";

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8 font-mono text-[#F5F2EC]">
      <header>
        <h1 className="text-2xl font-bold">Akiles testpagina (tijdelijk)</h1>
        <p className="text-sm opacity-70">
          platform {platform} {native ? "(native)" : "(web: plugin niet beschikbaar)"} · sessie{" "}
          {sessionId ?? "geen"}
        </p>
      </header>

      <section className="space-y-2 rounded border border-[#2A2622] bg-[#1A1814] p-4">
        <div className="text-lg">status: {status}</div>
        {error ? (
          <div className="rounded border-2 border-red-500 p-3">
            <div className="text-3xl font-bold text-red-400">{error.code}</div>
            {error.sdkCode ? <div className="text-xl">sdkCode: {error.sdkCode}</div> : null}
            {error.reason ? <div className="text-xl">reason: {error.reason}</div> : null}
            <div className="mt-1 text-sm break-words opacity-80">{error.message}</div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">1. Token</h2>
        <button type="button" className={button} disabled={busy !== null} onClick={fetchToken}>
          Token ophalen
        </button>
        <label className="block text-sm">
          of plak een member token (mt_...)
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="mt-1 w-full rounded border border-[#2A2622] bg-[#0B0B0B] p-3 text-sm"
            placeholder="mt_..."
          />
        </label>
        {tokenRowId ? (
          <div className="text-xs opacity-70">
            rij in access_device_tokens: {tokenRowId}{" "}
            <button type="button" className="underline" disabled={busy !== null} onClick={revokeToken}>
              token intrekken
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">2. Koppelen</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy !== null || !token.trim()} onClick={connect}>
            Koppelen
          </button>
          <button type="button" className={button} disabled={busy !== null || !sessionId} onClick={loadGadgets}>
            Gadgets ophalen
          </button>
          <button type="button" className={button} disabled={busy !== null || !sessionId} onClick={refresh}>
            Verversen
          </button>
          <button type="button" className={button} disabled={busy !== null} onClick={clearSession}>
            Sessie wissen
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">3. Deuren</h2>
        {gadgets.length === 0 ? (
          <p className="text-sm opacity-70">nog geen gadgets (koppel eerst)</p>
        ) : (
          <ul className="space-y-2">
            {gadgets.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 rounded border border-[#2A2622] p-3">
                <div className="min-w-0">
                  <div className="truncate text-base">{g.name}</div>
                  <div className="truncate text-xs opacity-60">
                    {g.id} · acties: {g.actions.map((a) => `${a.name} (${a.id})`).join(", ") || "geen"}
                  </div>
                </div>
                <button
                  type="button"
                  className={`${button} bg-[#C9A86B] text-[#0B0B0B]`}
                  disabled={busy !== null || g.actions.length === 0}
                  onClick={() => open(g)}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">Log</h2>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-[#2A2622] bg-[#0B0B0B] p-3 text-xs">
          {log.join("\n") || "leeg"}
        </pre>
      </section>
    </main>
  );
}

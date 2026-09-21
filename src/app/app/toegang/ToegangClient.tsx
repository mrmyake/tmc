"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { AlertCircle, Check, KeyRound, Smartphone } from "lucide-react";
import {
  Akiles,
  isAkilesError,
  type AkilesGadget,
  type AkilesOpenStatus,
} from "akiles-capacitor";
import {
  issueMyAccessDeviceToken,
  revokeMyAccessDeviceToken,
} from "@/lib/actions/access-devices";
import {
  ACCESS_DEVICE_TOKEN_ID_KEY,
  clearDeviceValue,
  readDeviceValue,
  writeDeviceValue,
} from "@/lib/native/device-storage";

/**
 * Toestandsmachine van het deurscherm (mockups/akiles-toegang.html, PR #202).
 * Alleen gerenderd voor een profiel met actieve toegang; de server-render
 * heeft dat al beslist (page.tsx).
 *
 * Het member token uit issueMyAccessDeviceToken bestaat uitsluitend binnen
 * pair(): het gaat naar Akiles.initialize en daarna naar niemand. Alleen
 * het rij-id gaat naar localStorage, zodat het uitlogpad (E1) het kan
 * meesturen. Foutcodes van de plugin komen nooit in beeld; ze gaan naar de
 * console, de tekst voor het lid komt uit FAILURE_COPY.
 */

type FailureCause =
  | "bluetooth_off"
  | "bluetooth_permission"
  | "out_of_range"
  | "denied"
  | "session_expired"
  | "pair_failed"
  | "remove_failed"
  | "unknown";

type Phase =
  | { kind: "checking" }
  | { kind: "not_available" }
  | { kind: "unpaired" }
  | { kind: "pairing" }
  | { kind: "paired" }
  | { kind: "opening"; gadget: AkilesGadget; status: AkilesOpenStatus | null }
  | { kind: "opened"; gadget: AkilesGadget }
  | {
      kind: "failed";
      cause: FailureCause;
      gadget: AkilesGadget | null;
      /** Alleen bij pair_failed: de klanttekst uit de server action. */
      message?: string;
      /** Alleen bij bluetooth_permission: definitief geweigerd, dus naar de instellingen. */
      permanent?: boolean;
    }
  | { kind: "confirm_remove" }
  | { kind: "removing" };

// COPY: confirm met Marlon
const FAILURE_COPY: Record<FailureCause, { title: string; body: string; action: string }> = {
  bluetooth_off: {
    title: "Bluetooth staat uit",
    body: "Zet Bluetooth aan in de instellingen van je telefoon en probeer opnieuw.",
    action: "Opnieuw proberen",
  },
  bluetooth_permission: {
    title: "Geen toestemming voor Bluetooth",
    body: "The Movement Club heeft toestemming nodig voor Bluetooth om de deur te openen.",
    action: "Toestemming geven",
  },
  out_of_range: {
    title: "Buiten bereik",
    body: "Kom dichter bij de deur en probeer het nog eens.",
    action: "Opnieuw proberen",
  },
  denied: {
    title: "Toegang geweigerd",
    body: "Deze deur kan nu niet open. Neem contact op met de studio.",
    action: "Contact opnemen",
  },
  session_expired: {
    title: "Sessie verlopen",
    body: "Je koppeling is verlopen. Koppel dit toestel opnieuw aan de deur.",
    action: "Opnieuw koppelen",
  },
  pair_failed: {
    title: "Koppelen lukte niet",
    body: "Probeer het zo nog eens.",
    action: "Opnieuw proberen",
  },
  remove_failed: {
    title: "Verwijderen lukte niet",
    body: "Controleer je internetverbinding en probeer het nog eens.",
    action: "Opnieuw proberen",
  },
  unknown: {
    title: "Deur ging niet open",
    body: "Probeer het nog eens. Blijft het misgaan, laat het ons weten.",
    action: "Opnieuw proberen",
  },
};

// COPY: confirm met Marlon
const PERMISSION_PERMANENT_BODY =
  "Geef The Movement Club toestemming voor Bluetooth in de instellingen van je telefoon en kom dan terug.";

// COPY: confirm met Marlon
const OPEN_STATUS_COPY: Record<AkilesOpenStatus, string> = {
  SCANNING: "Zoeken naar de deur",
  CONNECTING: "Verbinden",
  SYNCING_DEVICE: "Even geduld",
  SYNCING_SERVER: "Even geduld",
  EXECUTING_ACTION: "Openen",
};

/** Hoe lang "Gelukt" blijft staan voordat de deurenlijst terugkomt. */
const OPENED_RESET_MS = 6000;

function isSessionError(err: unknown): boolean {
  return isAkilesError(err) && (err.code === "NO_SESSION" || err.code === "INVALID_TOKEN");
}

function causeFor(err: unknown): FailureCause {
  if (!isAkilesError(err)) return "unknown";
  switch (err.code) {
    case "BLUETOOTH_OFF":
      return "bluetooth_off";
    case "BLUETOOTH_PERMISSION_DENIED":
      return "bluetooth_permission";
    case "OUT_OF_RANGE":
      return "out_of_range";
    case "DENIED_BY_AKILES":
      return "denied";
    case "NO_SESSION":
    case "INVALID_TOKEN":
      return "session_expired";
    default:
      return "unknown";
  }
}

const noopSubscribe = () => () => {};

/** Hydration-veilig: server en eerste client-render zeggen allebei "geen app". */
function useIsNativeApp(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => Capacitor.isNativePlatform(),
    () => false,
  );
}

/** Alleen voor de console: code en SDK-details, nooit een tokenwaarde. */
function logPluginError(step: string, err: unknown): void {
  if (isAkilesError(err)) {
    console.error(`[toegang] ${step} mislukt`, err.code, err.data ?? {});
  } else {
    console.error(`[toegang] ${step} mislukt`, err);
  }
}

export function ToegangClient() {
  const isNativeApp = useIsNativeApp();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [gadgets, setGadgets] = useState<AkilesGadget[]>([]);

  const loadGadgets = useCallback(async () => {
    try {
      const { gadgets: list } = await Akiles.getGadgets();
      setGadgets(list);
      setPhase({ kind: "paired" });
    } catch (err) {
      logPluginError("deuren ophalen", err);
      if (isAkilesError(err) && err.code === "NOT_AVAILABLE") {
        setPhase({ kind: "not_available" });
        return;
      }
      setPhase({ kind: "failed", cause: causeFor(err), gadget: null });
    }
  }, []);

  const pair = useCallback(async () => {
    setPhase({ kind: "pairing" });
    const platform = Capacitor.getPlatform();
    if (platform !== "ios" && platform !== "android") {
      setPhase({ kind: "not_available" });
      return;
    }

    // Een eerder token van dit toestel blijft bij Akiles geldig naast het
    // nieuwe; eerst intrekken, dan pas opnieuw uitgeven.
    const staleId = readDeviceValue(ACCESS_DEVICE_TOKEN_ID_KEY);
    if (staleId) {
      try {
        await revokeMyAccessDeviceToken(staleId);
      } catch (err) {
        console.error("[toegang] oud token intrekken mislukt", err);
      }
      clearDeviceValue(ACCESS_DEVICE_TOKEN_ID_KEY);
    }

    let issued: Awaited<ReturnType<typeof issueMyAccessDeviceToken>>;
    try {
      issued = await issueMyAccessDeviceToken(
        platform,
        // COPY: confirm met Marlon
        platform === "ios" ? "iOS-app" : "Android-app",
      );
    } catch (err) {
      console.error("[toegang] token uitgeven mislukt", err);
      setPhase({ kind: "failed", cause: "pair_failed", gadget: null });
      return;
    }
    if (!issued.ok) {
      setPhase({ kind: "failed", cause: "pair_failed", gadget: null, message: issued.error });
      return;
    }

    try {
      await Akiles.initialize({ token: issued.token });
    } catch (err) {
      logPluginError("koppelen", err);
      // Bij Akiles uitgegeven maar op dit toestel onbruikbaar: meteen weer
      // intrekken, anders blijft er een token bestaan dat niemand gebruikt.
      try {
        await revokeMyAccessDeviceToken(issued.id);
      } catch (revokeErr) {
        console.error("[toegang] onbruikbaar token intrekken mislukt", revokeErr);
      }
      if (isAkilesError(err) && err.code === "NOT_AVAILABLE") {
        setPhase({ kind: "not_available" });
        return;
      }
      setPhase({ kind: "failed", cause: "pair_failed", gadget: null });
      return;
    }

    writeDeviceValue(ACCESS_DEVICE_TOKEN_ID_KEY, issued.id);
    await loadGadgets();
  }, [loadGadgets]);

  useEffect(() => {
    if (!isNativeApp) return;
    let cancelled = false;
    (async () => {
      const { sessionId } = await Akiles.getSession();
      if (cancelled) return;
      if (!sessionId) {
        setPhase({ kind: "unpaired" });
        return;
      }
      try {
        await Akiles.refresh();
      } catch (err) {
        if (cancelled) return;
        if (isSessionError(err)) {
          logPluginError("sessie verversen", err);
          setPhase({ kind: "failed", cause: "session_expired", gadget: null });
          return;
        }
        // Geen internet of een tijdelijke storing: de cache van de SDK
        // blijft bruikbaar, dus gewoon door met de deurenlijst.
        console.warn("[toegang] verversen overgeslagen", isAkilesError(err) ? err.code : err);
      }
      if (cancelled) return;
      await loadGadgets();
    })().catch((err) => {
      if (cancelled) return;
      logPluginError("sessie controleren", err);
      setPhase({ kind: "unpaired" });
    });
    return () => {
      cancelled = true;
    };
  }, [isNativeApp, loadGadgets]);

  useEffect(() => {
    if (!isNativeApp) return;
    let handle: { remove: () => Promise<void> } | undefined;
    Akiles.addListener("openStatus", (event) => {
      setPhase((current) =>
        current.kind === "opening" ? { ...current, status: event.status } : current,
      );
    })
      .then((h) => {
        handle = h;
      })
      .catch((err) => {
        console.warn("[toegang] statuslistener niet beschikbaar", err);
      });
    return () => {
      void handle?.remove();
    };
  }, [isNativeApp]);

  useEffect(() => {
    if (phase.kind !== "opened") return;
    const timer = window.setTimeout(() => setPhase({ kind: "paired" }), OPENED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [phase.kind]);

  async function open(gadget: AkilesGadget) {
    setPhase({ kind: "opening", gadget, status: null });
    try {
      await Akiles.open({ gadgetId: gadget.id });
      setPhase({ kind: "opened", gadget });
    } catch (err) {
      logPluginError(`openen van ${gadget.name}`, err);
      if (isAkilesError(err)) {
        if (err.code === "CANCELLED") {
          setPhase({ kind: "paired" });
          return;
        }
        if (err.code === "NOT_AVAILABLE") {
          setPhase({ kind: "not_available" });
          return;
        }
      }
      setPhase({
        kind: "failed",
        cause: causeFor(err),
        gadget,
        permanent: isAkilesError(err) ? err.data?.permanent : undefined,
      });
    }
  }

  async function removeDevice() {
    setPhase({ kind: "removing" });
    const id = readDeviceValue(ACCESS_DEVICE_TOKEN_ID_KEY);
    if (id) {
      let result: Awaited<ReturnType<typeof revokeMyAccessDeviceToken>>;
      try {
        result = await revokeMyAccessDeviceToken(id);
      } catch (err) {
        console.error("[toegang] token intrekken mislukt", err);
        setPhase({ kind: "failed", cause: "remove_failed", gadget: null });
        return;
      }
      if (!result.ok) {
        // "Niet (meer) gekoppeld" of niet geconfigureerd: dan is er
        // server-side niets meer in te trekken en ruimen we lokaal op.
        console.warn("[toegang] token intrekken afgewezen", result.error);
      }
    }
    try {
      await Akiles.clearSession();
    } catch (err) {
      logPluginError("sessie wissen", err);
    }
    clearDeviceValue(ACCESS_DEVICE_TOKEN_ID_KEY);
    setGadgets([]);
    setPhase({ kind: "unpaired" });
  }

  function retryAfterFailure(failed: Extract<Phase, { kind: "failed" }>) {
    switch (failed.cause) {
      case "session_expired":
      case "pair_failed":
        void pair();
        return;
      case "remove_failed":
        void removeDevice();
        return;
      default:
        if (failed.gadget) {
          void open(failed.gadget);
        } else {
          void loadGadgets();
        }
    }
  }

  return (
    <section className="relative bg-bg-elevated p-6 md:p-8">
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
      />
      {renderPhase()}
    </section>
  );

  function renderPhase() {
    const shown: Phase = isNativeApp ? phase : { kind: "not_available" };
    switch (shown.kind) {
      case "checking":
        return (
          <Busy
            // COPY: confirm met Marlon
            title="Even kijken"
            body="We controleren of dit toestel gekoppeld is."
          />
        );

      case "not_available":
        return (
          <>
            <Badge tone="muted">
              <Smartphone size={22} strokeWidth={1.5} aria-hidden />
            </Badge>
            {/* COPY: confirm met Marlon */}
            <Heading>Alleen in de app</Heading>
            {/* COPY: confirm met Marlon */}
            <Copy>
              De deur openen met je telefoon werkt alleen in de app van The
              Movement Club. Je deurcode vind je op je profiel.
            </Copy>
            <div className="mt-8">
              <SecondaryLink href="/app/profiel">
                {/* COPY: confirm met Marlon */}
                Naar mijn profiel
              </SecondaryLink>
            </div>
          </>
        );

      case "unpaired":
        return (
          <>
            <Badge tone="accent">
              <KeyRound size={22} strokeWidth={1.5} aria-hidden />
            </Badge>
            {/* COPY: confirm met Marlon */}
            <Heading>Koppel dit toestel aan de deur</Heading>
            {/* COPY: confirm met Marlon */}
            <Copy>
              Na het koppelen open je de deuren van de studio met je telefoon.
              Dat werkt via Bluetooth, ook zonder internet, en alleen op dit
              toestel.
            </Copy>
            {/* COPY: confirm met Marlon */}
            <Copy>Koppelen kost eenmalig een paar seconden.</Copy>
            <div className="mt-8">
              <PrimaryButton onClick={() => void pair()}>
                {/* COPY: confirm met Marlon */}
                Koppel dit toestel
              </PrimaryButton>
            </div>
          </>
        );

      case "pairing":
        return (
          <Busy
            // COPY: confirm met Marlon
            title="Toestel koppelen"
            body="Momentje, dit duurt een paar seconden."
          />
        );

      case "paired":
      case "confirm_remove":
      case "removing": {
        const dimmed = shown.kind !== "paired";
        return (
          <>
            <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-success mb-4">
              <span aria-hidden className="w-2 h-2 rounded-full bg-success" />
              {/* COPY: confirm met Marlon */}
              Dit toestel is gekoppeld
            </p>
            {/* COPY: confirm met Marlon */}
            <Copy>Tik op een deur om die te openen. Blijf dichtbij tot hij open is.</Copy>

            <ul className={`mt-6 space-y-3 ${dimmed ? "opacity-40" : ""}`}>
              {gadgets.length === 0 ? (
                <li className="text-text-muted text-sm">
                  {/* COPY: confirm met Marlon */}
                  Er zijn nog geen deuren voor je vrijgegeven. Probeer het
                  straks opnieuw of laat het ons weten.
                </li>
              ) : (
                gadgets.map((gadget) => (
                  <li
                    key={gadget.id}
                    className="flex items-center justify-between gap-4 bg-bg p-5"
                  >
                    <span className="text-text text-base font-medium min-w-0 truncate">
                      {gadget.name}
                    </span>
                    <button
                      type="button"
                      disabled={dimmed || gadget.actions.length === 0}
                      onClick={() => void open(gadget)}
                      className="shrink-0 min-h-14 min-w-[104px] px-6 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg hover:bg-accent-hover transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {/* COPY: confirm met Marlon */}
                      Open
                    </button>
                  </li>
                ))
              )}
            </ul>

            {shown.kind === "paired" ? (
              <div className="mt-10">
                <DangerButton onClick={() => setPhase({ kind: "confirm_remove" })}>
                  {/* COPY: confirm met Marlon */}
                  Dit toestel verwijderen
                </DangerButton>
              </div>
            ) : (
              <div className="mt-8 bg-bg p-5 border border-danger/30">
                {/* COPY: confirm met Marlon */}
                <p className="text-text-muted text-sm leading-relaxed mb-5">
                  Dit toestel kan de deur dan niet meer openen. Je kunt het
                  later opnieuw koppelen.
                </p>
                <div className="space-y-3">
                  <DangerButton
                    disabled={shown.kind === "removing"}
                    onClick={() => void removeDevice()}
                  >
                    {/* COPY: confirm met Marlon */}
                    {shown.kind === "removing" ? "Verwijderen..." : "Ja, toestel verwijderen"}
                  </DangerButton>
                  <SecondaryButton
                    disabled={shown.kind === "removing"}
                    onClick={() => setPhase({ kind: "paired" })}
                  >
                    {/* COPY: confirm met Marlon */}
                    Annuleren
                  </SecondaryButton>
                </div>
              </div>
            )}
          </>
        );
      }

      case "opening":
        return (
          <Busy
            // COPY: confirm met Marlon
            title={`${shown.gadget.name} wordt geopend`}
            body="Blijf dichtbij de deur."
            status={shown.status ? OPEN_STATUS_COPY[shown.status] : null}
          />
        );

      case "opened":
        return (
          <div className="flex flex-col items-center text-center pt-6">
            <Badge tone="success" large>
              <Check size={30} strokeWidth={2} aria-hidden />
            </Badge>
            {/* COPY: confirm met Marlon */}
            <Heading>{shown.gadget.name} is open</Heading>
            {/* COPY: confirm met Marlon */}
            <Copy>Fijne training.</Copy>
            <div className="mt-8 w-full">
              <SecondaryButton onClick={() => setPhase({ kind: "paired" })}>
                {/* COPY: confirm met Marlon */}
                Terug naar deuren
              </SecondaryButton>
            </div>
          </div>
        );

      case "failed": {
        const copy = FAILURE_COPY[shown.cause];
        const body =
          shown.cause === "pair_failed" && shown.message
            ? shown.message
            : shown.cause === "bluetooth_permission" && shown.permanent
              ? PERMISSION_PERMANENT_BODY
              : copy.body;
        const action =
          shown.cause === "bluetooth_permission" && shown.permanent
            ? "Opnieuw proberen"
            : copy.action;
        return (
          <>
            <Badge tone="danger">
              <AlertCircle size={22} strokeWidth={1.5} aria-hidden />
            </Badge>
            <p className="tmc-eyebrow block mb-3 text-danger">
              {/* COPY: confirm met Marlon */}
              {shown.gadget ? "Deur ging niet open" : "Niet gelukt"}
            </p>
            <Heading>{copy.title}</Heading>
            <Copy>{body}</Copy>
            <div className="mt-8 space-y-3">
              {shown.cause === "denied" ? (
                <SecondaryLink href="/app/support">{copy.action}</SecondaryLink>
              ) : (
                <PrimaryButton onClick={() => retryAfterFailure(shown)}>{action}</PrimaryButton>
              )}
              {shown.gadget || shown.cause === "denied" ? (
                <SecondaryButton onClick={() => setPhase({ kind: "paired" })}>
                  {/* COPY: confirm met Marlon */}
                  Terug naar deuren
                </SecondaryButton>
              ) : null}
            </div>
          </>
        );
      }
    }
  }
}

/* ---------- Bouwstenen ---------- */

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.1] tracking-[-0.02em] mb-4">
      {children}
    </h2>
  );
}

function Copy({ children }: { children: React.ReactNode }) {
  return <p className="text-text-muted text-sm leading-relaxed mb-3 max-w-md">{children}</p>;
}

function Badge({
  tone,
  large = false,
  children,
}: {
  tone: "accent" | "success" | "danger" | "muted";
  large?: boolean;
  children: React.ReactNode;
}) {
  const tones = {
    accent: "bg-accent/15 text-accent",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
    muted: "bg-bg text-text-muted",
  };
  return (
    <div
      className={`${large ? "w-[72px] h-[72px]" : "w-14 h-14"} rounded-full flex items-center justify-center mb-6 ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

function Busy({ title, body, status = null }: { title: string; body: string; status?: string | null }) {
  return (
    <div className="flex flex-col items-center text-center pt-6" role="status" aria-live="polite">
      <div
        aria-hidden
        className="w-14 h-14 rounded-full border-4 border-ink-500 border-t-accent animate-spin motion-reduce:animate-none mb-7"
      />
      <Heading>{title}</Heading>
      <Copy>{body}</Copy>
      {status ? (
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted mt-2">{status}</p>
      ) : null}
    </div>
  );
}

/* Grote raakvlakken: minimaal 56px hoog, volle breedte, ook met handschoenen te raken. */
const BIG =
  "inline-flex w-full min-h-14 items-center justify-center px-6 text-xs font-medium uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer disabled:opacity-50 disabled:pointer-events-none";

interface BigButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function PrimaryButton({ onClick, disabled, children }: BigButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${BIG} bg-accent text-bg hover:bg-accent-hover`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, disabled, children }: BigButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${BIG} border border-text-muted/30 text-text hover:border-accent hover:text-accent`}
    >
      {children}
    </button>
  );
}

function DangerButton({ onClick, disabled, children }: BigButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${BIG} border border-danger/40 text-danger hover:border-danger`}
    >
      {children}
    </button>
  );
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`${BIG} border border-text-muted/30 text-text hover:border-accent hover:text-accent`}>
      {children}
    </Link>
  );
}

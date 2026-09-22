"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import {
  confirmAccountDeletion,
  sendAccountDeletionCode,
  type ConfirmDeletionResult,
} from "@/lib/actions/account-deletion";
import type {
  DeletionPreflight,
  PreflightMembership,
} from "@/lib/member/account-deletion-preflight";
import { formatDateLong, parseIsoDateToAmsterdamMidnight } from "@/lib/format-date";

/**
 * Vier schermen, een component:
 *  - voorwaarde: het lidmaatschap loopt nog. Geen doodlopend scherm: de
 *    einddatum, een knop naar opzeggen, en de datum vanaf wanneer de
 *    gegevens verdwijnen als het lid vandaag opzegt.
 *  - overzicht: wat er gebeurt, wat er bewaard blijft en waarom, en de
 *    verwachte datum van verwijdering. Daarna een bevestigingscode.
 *  - code: 6 cijfers naar het bekende adres, zelfde drempel als inloggen.
 *  - klaar: het verzoek loopt, wat er al is ingetrokken, en de datum. Het
 *    lid is daarna overal uitgelogd (de kern bant de auth-user).
 */

// Gelijk aan OTP_LENGTH en RESEND_COOLDOWN_S in src/app/login/LoginForm.tsx.
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

interface Props {
  preflight: DeletionPreflight;
  email: string;
}

type Step = "overview" | "code" | "done";

function longDate(iso: string | null | undefined): string {
  if (!iso) return "onbekende datum";
  const date =
    iso.length === 10 ? parseIsoDateToAmsterdamMidnight(iso) : new Date(iso);
  return date ? formatDateLong(date) : "onbekende datum";
}

// COPY: confirm met Marlon
const STATUS_LABEL: Record<string, string> = {
  active: "loopt",
  paused: "gepauzeerd",
  payment_failed: "incasso niet gelukt",
  pending: "wacht op betaling",
  cancellation_requested: "opgezegd",
};

function Card({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <aside className="relative bg-bg-elevated p-6 md:p-8">
      {accent && (
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
        />
      )}
      {children}
    </aside>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">{children}</span>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-6 py-2.5 border-b border-[color:var(--ink-500)]/40 last:border-0">
      <span className="text-text-muted text-sm">{label}</span>
      <span className="text-text text-sm text-right">{value}</span>
    </li>
  );
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

// ---------------------------------------------------------------------------
// Scherm 1: voorwaarde (lidmaatschap loopt nog)
// ---------------------------------------------------------------------------

function ConditionScreen({
  running,
  expectedPurgeAfter,
  serverMessage,
}: {
  running: PreflightMembership[];
  expectedPurgeAfter: string;
  serverMessage: string | null;
}) {
  const subscriptions = running.filter((m) => m.isSubscription);
  const creditRows = running.filter((m) => !m.isSubscription);
  return (
    <div className="space-y-8">
      <Card accent>
        {/* COPY: confirm met Marlon */}
        <Eyebrow>Voorwaarde, geen blokkade</Eyebrow>
        <p className="text-text text-base mb-2">
          Je lidmaatschap loopt nog. Verwijderen kan zodra het is opgezegd.
        </p>
        <p className="text-text-muted text-sm leading-relaxed">
          Een account verwijderen en een lidmaatschap beeindigen zijn twee
          losse beslissingen. Het verwijderverzoek raakt je lidmaatschap en
          je betaling niet; daarom zeg je eerst op. Direct daarna kun je hier
          terugkomen en je verzoek indienen.
        </p>
        {serverMessage && (
          <p role="alert" className="text-[color:var(--danger)] text-sm mt-4">
            {serverMessage}
          </p>
        )}
      </Card>

      {subscriptions.length > 0 && (
        <section>
          {/* COPY: confirm met Marlon */}
          <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-4">
            Je abonnement
          </h2>
          <ul>
            {subscriptions.map((m) => (
              <li key={m.id} className="py-3 border-b border-[color:var(--ink-500)]/40 last:border-0">
                <p className="text-text text-sm">
                  {m.planVariant ?? "Abonnement"}{" "}
                  <span className="text-text-muted">({STATUS_LABEL[m.status] ?? m.status})</span>
                </p>
                <p className="text-text-muted text-sm mt-1">
                  {/* COPY: confirm met Marlon */}
                  Opzeggen kan per {longDate(m.earliestCancellationDate)}
                  {m.commitEndDate && m.earliestCancellationDate === m.commitEndDate
                    ? " (einde van je eerste looptijd)"
                    : ""}
                  .
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {/* COPY: confirm met Marlon */}
            <Button href="/app/abonnement">Naar opzeggen</Button>
          </div>
        </section>
      )}

      {creditRows.length > 0 && (
        <section>
          {/* COPY: confirm met Marlon */}
          <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-4">
            Je tegoed
          </h2>
          <ul>
            {creditRows.map((m) => (
              <Row
                key={m.id}
                label={m.planVariant ?? "Tegoed"}
                value={`${count(m.creditsRemaining, "credit", "credits")}${
                  m.creditsExpiresAt ? `, geldig tot ${longDate(m.creditsExpiresAt.slice(0, 10))}` : ""
                }`}
              />
            ))}
          </ul>
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted text-sm leading-relaxed mt-4">
            Een rittenkaart of PT-pakket met tegoed telt als lopend. Verwijderen
            kan zodra het tegoed op is of verlopen. Wil je eerder verwijderen,
            laat het Marlon weten; het tegoed vervalt dan.
          </p>
        </section>
      )}

      <Card>
        {/* COPY: confirm met Marlon */}
        <Eyebrow>Wat er dan gebeurt</Eyebrow>
        <p className="text-text-muted text-sm leading-relaxed">
          Zeg je vandaag op, dan kun je meteen je verzoek indienen. Je gegevens
          worden dan verwijderd na{" "}
          <span className="text-text">{longDate(expectedPurgeAfter)}</span>: na
          het einde van je lidmaatschap en je laatste factuur, met minimaal de
          bedenktijd.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scherm 2: overzicht (preflight) en reden
// ---------------------------------------------------------------------------

function OverviewScreen({
  preflight,
  reason,
  onReason,
  onContinue,
  busy,
  error,
}: {
  preflight: DeletionPreflight;
  reason: string;
  onReason: (v: string) => void;
  onContinue: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { cancelled, credits, bookings, waitlist, ptSessions, guestBookings, invoices } = preflight;
  return (
    <div className="space-y-10">
      <section>
        {/* COPY: confirm met Marlon */}
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-2">
          Wat er direct gebeurt
        </h2>
        <p className="text-text-muted text-sm leading-relaxed mb-4">
          Zodra je bevestigt, sluiten we je account af. Je wordt overal
          uitgelogd en kunt niet meer inloggen.
        </p>
        <ul>
          <Row label="Toegang tot de studio en gekoppelde toestellen" value="ingetrokken" />
          <Row label="Meldingen op je telefoon" value="uit" />
          <Row label="Geplande lessen" value={count(bookings, "wordt geannuleerd", "worden geannuleerd")} />
          {waitlist > 0 && <Row label="Wachtlijstplekken" value={count(waitlist, "vervalt", "vervallen")} />}
          {ptSessions > 0 && (
            <Row label="Geplande PT-sessies" value={count(ptSessions, "wordt geannuleerd", "worden geannuleerd")} />
          )}
          {guestBookings > 0 && (
            <Row label="Gasten die je hebt uitgenodigd" value={count(guestBookings, "boeking vervalt", "boekingen vervallen")} />
          )}
          <Row label="Nieuwsbrief" value="uitgeschreven" />
          {credits.map((m) => (
            <Row
              key={m.id}
              label={m.planVariant ?? "Tegoed"}
              value={`${count(m.creditsRemaining, "credit vervalt", "credits vervallen")}`}
            />
          ))}
        </ul>
      </section>

      <section>
        {/* COPY: confirm met Marlon */}
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-2">
          Wat er bewaard blijft, en waarom
        </h2>
        <ul>
          {cancelled.map((m) => (
            <Row
              key={m.id}
              label={`${m.planVariant ?? "Abonnement"}, opgezegd per ${longDate(m.cancellationEffectiveDate)}`}
              value="loopt door tot die datum"
            />
          ))}
          <Row
            label={`Facturen en betalingen${invoices > 0 ? ` (${count(invoices, "factuur", "facturen")})` : ""}`}
            value="7 jaar, wettelijke bewaarplicht"
          />
        </ul>
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-sm leading-relaxed mt-4">
          Een verwijderverzoek beeindigt geen overeenkomst en vervalt geen
          betaalverplichting. Wat nodig is om een opgezegd lidmaatschap netjes
          af te ronden, zoals je laatste factuur, blijft staan tot dat is
          gebeurd. Facturen en betaalgegevens bewaren we zeven jaar voor de
          Belastingdienst; die zijn daarna niet meer aan jou als persoon
          gekoppeld.
        </p>
      </section>

      <Card accent>
        {/* COPY: confirm met Marlon */}
        <Eyebrow>Wanneer</Eyebrow>
        <p className="text-text text-base">
          Je gegevens worden verwijderd na {longDate(preflight.expectedPurgeAfter)}.
        </p>
        <p className="text-text-muted text-sm leading-relaxed mt-2">
          Dat is na het einde van je lidmaatschap en je laatste factuur, met
          minimaal {preflight.coolingOffDays} dagen bedenktijd. Je krijgt een
          mail zodra het gebeurd is.
        </p>
      </Card>

      <Field label="Reden" hint="Optioneel. Helpt ons om beter te worden.">
        <textarea
          name="reason"
          rows={3}
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          placeholder="Waarom wil je je account verwijderen?"
          className={`${fieldInputClasses} resize-none`}
        />
      </Field>

      {error && (
        <p role="alert" className="text-[color:var(--danger)] text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Button
          type="button"
          onClick={onContinue}
          className={busy ? "opacity-50 pointer-events-none" : ""}
        >
          {/* COPY: confirm met Marlon */}
          {busy ? "Bezig..." : "Stuur bevestigingscode"}
        </Button>
        <Link
          href="/app/profiel"
          className="text-xs text-text-muted hover:text-text transition-colors duration-300 py-2 text-center"
        >
          {/* COPY: confirm met Marlon */}
          Nee, toch niet
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scherm 3: bevestigingscode
// ---------------------------------------------------------------------------

function CodeScreen({
  email,
  code,
  onCode,
  onSubmit,
  onResend,
  cooldown,
  busy,
  error,
}: {
  email: string;
  code: string;
  onCode: (v: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  cooldown: number;
  busy: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-6"
    >
      <Card accent>
        {/* COPY: confirm met Marlon */}
        <Eyebrow>Check je mail</Eyebrow>
        <p className="text-text-muted text-sm leading-relaxed">
          We hebben een code van {OTP_LENGTH} cijfers gestuurd naar{" "}
          <span className="text-text">{email}</span>. De code is 10 minuten
          geldig. Zo weten we zeker dat jij het bent.
        </p>
      </Card>

      <div>
        <label
          htmlFor="deletion-code"
          className="block text-xs uppercase tracking-[0.2em] text-text-muted mb-2"
        >
          {/* COPY: confirm met Marlon */}
          Bevestigingscode
        </label>
        <input
          id="deletion-code"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP_LENGTH}
          required
          autoFocus
          placeholder={"0".repeat(OTP_LENGTH)}
          value={code}
          onChange={(e) => onCode(e.target.value.replace(/\D/g, ""))}
          className={`${inputStyles} text-center tracking-[0.4em] font-medium`}
        />
      </div>

      {error && (
        <div role="alert" className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
          {error}
        </div>
      )}

      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-xs leading-relaxed">
        Na bevestiging is dit definitief: je wordt overal uitgelogd en kunt
        niet meer inloggen.
      </p>

      <button
        type="submit"
        disabled={busy || code.length !== OTP_LENGTH}
        className="w-full inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-[color:var(--danger)] hover:text-[color:var(--danger)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        {busy ? "Bezig..." : "Bevestig en verwijder mijn account"}
      </button>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <Link href="/app/profiel" className="hover:text-accent uppercase tracking-[0.2em]">
          {/* COPY: confirm met Marlon */}
          Annuleren
        </Link>
        <button
          type="button"
          onClick={() => {
            onResend();
            inputRef.current?.focus();
          }}
          disabled={cooldown > 0 || busy}
          className={
            cooldown > 0 || busy
              ? "uppercase tracking-[0.2em] opacity-50 cursor-not-allowed"
              : "hover:text-accent uppercase tracking-[0.2em] cursor-pointer"
          }
        >
          {/* COPY: confirm met Marlon */}
          {cooldown > 0 ? `Nieuwe code (${cooldown}s)` : "Nieuwe code"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Scherm 4: klaar
// ---------------------------------------------------------------------------

function DoneScreen({ result }: { result: Extract<ConfirmDeletionResult, { ok: true }> }) {
  const r = result.revoked;
  return (
    <div className="space-y-8">
      <Card accent>
        {/* COPY: confirm met Marlon */}
        <Eyebrow>Je verzoek loopt</Eyebrow>
        <p className="text-text text-base mb-2">
          Je account is afgesloten. Je gegevens worden verwijderd na{" "}
          {longDate(result.purgeAfter)}.
        </p>
        <p className="text-text-muted text-sm leading-relaxed">
          Je krijgt een mail op je huidige adres zodra dat is gebeurd. Tot die
          tijd bewaren we alleen wat nodig is om je lidmaatschap af te ronden,
          en daarna alleen wat de wet vraagt.
        </p>
      </Card>

      <section>
        {/* COPY: confirm met Marlon */}
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-4">
          Al gedaan
        </h2>
        <ul>
          <Row label="Toegang tot de studio" value="ingetrokken" />
          <Row label="Gekoppelde toestellen en meldingen" value={count(r.devices, "koppeling verwijderd", "koppelingen verwijderd")} />
          <Row label="Geplande lessen" value={count(r.bookings, "geannuleerd", "geannuleerd")} />
          {r.waitlist > 0 && <Row label="Wachtlijstplekken" value={count(r.waitlist, "vervallen", "vervallen")} />}
          {r.ptSessions > 0 && <Row label="PT-sessies" value={count(r.ptSessions, "geannuleerd", "geannuleerd")} />}
          {r.guestBookings > 0 && <Row label="Gastboekingen" value={count(r.guestBookings, "vervallen", "vervallen")} />}
          <Row label="Nieuwsbrief" value="uitgeschreven" />
          <Row label="Aangevraagd op" value={longDate(result.requestedAt)} />
        </ul>
      </section>

      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm leading-relaxed">
        Je bent nu op al je apparaten uitgelogd. Bedankt dat je bij ons hebt
        getraind. Bedenk je je, laat het Marlon dan zo snel mogelijk weten;
        binnen de bedenktijd kan zij het verzoek nog terugdraaien.
      </p>

      <Button href="/">Naar de website</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// De flow
// ---------------------------------------------------------------------------

export function DeletionFlow({ preflight, email }: Props) {
  const [step, setStep] = useState<Step>("overview");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [blockedByServer, setBlockedByServer] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<ConfirmDeletionResult, { ok: true }> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown((s) => (s > 1 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) return <DoneScreen result={done} />;

  if (preflight.open) {
    return (
      <Card accent>
        {/* COPY: confirm met Marlon */}
        <Eyebrow>Je verzoek loopt</Eyebrow>
        <p className="text-text text-base mb-2">
          Aangevraagd op {longDate(preflight.open.requestedAt)}. Je gegevens
          worden verwijderd na {longDate(preflight.open.purgeAfter)}.
        </p>
        <p className="text-text-muted text-sm leading-relaxed">
          Bedenk je je, laat het Marlon weten; binnen de bedenktijd kan zij het
          verzoek terugdraaien.
        </p>
      </Card>
    );
  }

  if (preflight.running.length > 0 || blockedByServer) {
    return (
      <ConditionScreen
        running={preflight.running}
        expectedPurgeAfter={preflight.expectedPurgeAfter}
        serverMessage={blockedByServer}
      />
    );
  }

  async function sendCode(): Promise<boolean> {
    const res = await sendAccountDeletionCode();
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setCooldown(RESEND_COOLDOWN_S);
    return true;
  }

  async function handleContinue() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const sent = await sendCode();
    setBusy(false);
    if (sent) {
      setCode("");
      setStep("code");
    }
  }

  async function handleResend() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    await sendCode();
    setBusy(false);
    setCode("");
  }

  async function handleConfirm() {
    if (busy || code.length !== OTP_LENGTH) return;
    setBusy(true);
    setError(null);
    const res = await confirmAccountDeletion({ code, reason });
    setBusy(false);
    if (res.ok) {
      setDone(res);
      return;
    }
    if (res.reason === "membership_active") {
      // De server is de waarheid: sinds het laden van deze pagina is er iets
      // veranderd (bijvoorbeeld een nieuw abonnement). Terug naar de voorwaarde.
      setBlockedByServer(res.error);
      return;
    }
    setError(res.error);
  }

  if (step === "code") {
    return (
      <CodeScreen
        email={email}
        code={code}
        onCode={setCode}
        onSubmit={handleConfirm}
        onResend={handleResend}
        cooldown={cooldown}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <OverviewScreen
      preflight={preflight}
      reason={reason}
      onReason={setReason}
      onContinue={handleContinue}
      busy={busy}
      error={error}
    />
  );
}

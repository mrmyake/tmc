"use client";

import { useState } from "react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { formatEuro } from "@/lib/format";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";
import { startTrialBooking } from "@/lib/actions/trial-booking";
import { startOpeningTrialBooking } from "@/lib/actions/opening-trial";
import { trackLead, trackFormStart } from "@/lib/analytics";
import { openCheckout, returnTargetForThisClient } from "@/lib/native/checkout";
import { leadAttributionForSubmit } from "@/lib/attribution/consent";
import type { AttributionParams } from "@/lib/attribution/params";

import type { TrialSessionOption } from "@/lib/trial-sessions";
import type { TrialCodeScope } from "@/lib/trial-codes/scope";
import { CodeInfoBanner } from "../_components/CodeInfoBanner";

interface Props {
  options: TrialSessionOption[];
  /**
   * "paid": drop-in-prijs betalen via Mollie. "code": gratis via een
   * proefcode uit /proefles/code (geen prijzen, geen Mollie); de code zelf
   * zit in het httpOnly-cookie en wordt server-side gelezen. "free": gratis
   * in de openingsperiode (/proefles/gratis, tmc.book_opening_trial);
   * spotsAvailable is dan het aantal gratis plekken dat nog over is.
   */
  mode: "paid" | "code" | "free";
  /** Code-modus: de code bleek bij het boeken niet (meer) geldig. */
  onCodeInvalid?: (message: string) => void;
  /** Code-modus: de ingevoerde code en zijn scope (alleen voor weergave). */
  codeInfo?: { code: string; scope: TrialCodeScope; onChangeCode: () => void };
  /**
   * Gratis modus: de pagina heeft zelf al een kop en de keuze tussen
   * groepsles en vrij trainen; de lijst toont dan geen eigen kop.
   */
  embedded?: boolean;
  /**
   * Advertentie- en campagneparameters uit de URL van de pagina
   * (spec-marketing-attribution.md); gaan met de bannerkeuze mee in de
   * action-input en worden server-side opnieuw gevalideerd.
   */
  attribution?: AttributionParams;
}

export function TrialBookingList({
  options: initialOptions,
  mode,
  onCodeInvalid,
  codeInfo,
  embedded = false,
  attribution = {},
}: Props) {
  const isCode = mode === "code";
  const isFree = mode === "free";
  const showPrices = mode === "paid";
  const [options, setOptions] = useState(initialOptions);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formStarted, setFormStarted] = useState(false);

  const selected = options.find((o) => o.id === selectedId) ?? null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");

    if (isFree) {
      // Gratis openingsperiode: eigen actie en RPC, geen Mollie en geen code.
      const result = await startOpeningTrialBooking({
        sessionId: selected.id,
        name,
        email,
        phone,
        attribution: leadAttributionForSubmit(attribution),
      });
      if (!result.ok) {
        setBusy(false);
        if (result.step === "period") {
          // De periode is intussen voorbij: terug naar de drie kaarten.
          window.location.assign("/proefles");
          return;
        }
        if (result.step === "session") {
          // De les is niet (meer) bruikbaar; lokaal uit de lijst zodat hij
          // niet meteen weer wordt gekozen.
          setOptions((prev) => prev.filter((o) => o.id !== selected.id));
          setSelectedId(null);
          setNotice(result.error);
          return;
        }
        setError(result.error);
        return;
      }
      // Bestaand event, waarde 0 (spec-analytics.md eventregister).
      trackLead("trial_booking", 0);
      window.location.assign(result.redirectUrl);
      return;
    }

    const result = await startTrialBooking({
      sessionId: selected.id,
      name,
      email,
      phone,
      mode,
      returnTarget: returnTargetForThisClient(),
      attribution: leadAttributionForSubmit(attribution),
    });

    if (!result.ok) {
      setBusy(false);
      if (isCode && result.step === "code") {
        // Het cookie is server-side gewist; terug naar de codestap.
        onCodeInvalid?.(result.error);
        return;
      }
      if (isCode && result.step === "session") {
        // De net gekozen sessie is niet (meer) bruikbaar; de code blijft
        // geldig. Lokaal uit de lijst halen voorkomt dat 'm meteen weer
        // wordt gekozen zonder nieuwe paginalaad.
        setOptions((prev) => prev.filter((o) => o.id !== selected.id));
        setSelectedId(null);
        setNotice(result.error);
        return;
      }
      setError(result.error);
      return;
    }

    if (result.free) {
      // Gratis via proefcode: geen Mollie, de boeking staat al vast.
      // Bestaand event, waarde 0 (spec-analytics.md eventregister).
      trackLead("trial_booking", 0);
      window.location.assign(result.redirectUrl);
      return;
    }

    trackLead("trial_booking", selected.priceCents / 100);
    await openCheckout(result.checkoutUrl);
  }

  function spotsLabel(spots: number | null): string {
    if (spots === null) {
      // COPY: confirm met Marlon
      return "Onbeperkt aantal plekken";
    }
    if (isFree) {
      // COPY: confirm met Marlon
      return `Nog ${spots} gratis ${spots === 1 ? "plek" : "plekken"}`;
    }
    return `${spots} ${spots === 1 ? "plek" : "plekken"}`;
  }

  const body = (
    <>
      {!embedded && (
        <ScrollReveal>
          <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
            <span aria-hidden className="w-12 h-px bg-accent" />
            {/* COPY: confirm met Marlon */}
            {isCode ? "Gratis · Met proefcode" : isFree ? "Gratis · Openingsperiode" : "Direct een plek"}
            <span aria-hidden className="w-12 h-px bg-accent" />
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
            {/* COPY: confirm with Marlon */}
            Kies je sessie
          </h1>
          {isCode && codeInfo && (
            <CodeInfoBanner
              code={codeInfo.code}
              scope={codeInfo.scope}
              onChangeCode={codeInfo.onChangeCode}
            />
          )}
        </ScrollReveal>
      )}

      {notice && !selected && (
        <div className="mb-6 text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
          {notice}
        </div>
      )}

      {options.length === 0 && (
        <ScrollReveal delay={0.05}>
          <div className="bg-bg-elevated p-8 text-center">
            <p className="text-text-muted text-sm">
              {isFree
                ? // COPY: confirm met Marlon
                  "Op dit moment zijn alle gratis proefplekken voor de komende twee weken vergeven. Kies vrij trainen, of laat je gegevens achter via \"Liever gebeld worden\" op de vorige pagina, dan nemen we persoonlijk contact op."
                : // COPY: confirm with Marlon
                  "Op dit moment zijn er geen sessies met een vrije plek beschikbaar om als proefles te boeken. Kies liever de optie \"Liever gebeld worden\" op de vorige pagina, dan nemen we persoonlijk contact op."}
            </p>
          </div>
        </ScrollReveal>
      )}

      {!selected && options.length > 0 && (
        <ScrollReveal delay={0.05}>
          <ul className="border-t border-[color:var(--ink-500)]/60">
            {options.map((o) => (
              <li
                key={o.id}
                className="border-b border-[color:var(--ink-500)]/40"
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className="w-full flex items-center justify-between gap-4 py-5 text-left hover:bg-bg-elevated/60 transition-colors duration-300"
                >
                  <div className="min-w-0">
                    <p className="text-text text-sm font-medium">
                      {o.className}{" "}
                      <span className="text-text-muted">
                        &middot; {o.pillarLabel}
                      </span>
                    </p>
                    <p className="text-text-muted text-xs mt-1">
                      {formatWeekdayDate(new Date(o.startAt))} &middot;{" "}
                      {formatTimeRange(
                        new Date(o.startAt),
                        new Date(o.endAt),
                      )}{" "}
                      &middot; {o.trainerName}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {showPrices && (
                      <p className="text-text text-sm font-medium tabular-nums">
                        {formatEuro(Math.round(o.priceCents / 100))}
                      </p>
                    )}
                    <p className="text-text-muted text-xs">{spotsLabel(o.spotsAvailable)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </ScrollReveal>
      )}

      {selected && (
        <ScrollReveal delay={0.05}>
          <div className="bg-bg-elevated p-8 md:p-10 relative">
            <div
              aria-hidden
              className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
            />
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent mb-6"
            >
              &larr; Andere sessie kiezen
            </button>
            <p className="text-text text-sm font-medium mb-1">
              {selected.className} &middot; {selected.pillarLabel}
            </p>
            <p className="text-text-muted text-xs mb-8">
              {formatWeekdayDate(new Date(selected.startAt))} &middot;{" "}
              {formatTimeRange(
                new Date(selected.startAt),
                new Date(selected.endAt),
              )}
              {showPrices && (
                <> &middot; {formatEuro(Math.round(selected.priceCents / 100))}</>
              )}
              {isFree && (
                <>
                  {" "}
                  {/* COPY: confirm met Marlon */}
                  &middot; Gratis
                </>
              )}
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <Field label="Naam">
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onFocus={() => {
                    if (!formStarted) {
                      trackFormStart("trial_booking_form");
                      setFormStarted(true);
                    }
                  }}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldInputClasses}
                />
              </Field>
              <Field label="E-mailadres">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldInputClasses}
                />
              </Field>
              <Field
                label="Telefoon"
                // COPY: confirm met Marlon
                hint={isFree ? "Met landcode als je geen Nederlands nummer hebt, bijvoorbeeld +32." : undefined}
              >
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={fieldInputClasses}
                />
              </Field>
              {error && (
                <div
                  role="alert"
                  className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className={`w-full text-center ${busy ? "opacity-50 pointer-events-none" : ""}`}
              >
                {/* COPY: confirm met Marlon */}
                {busy
                  ? "Bezig..."
                  : isCode || isFree
                    ? "Gratis boeken"
                    : `Betaal ${formatEuro(Math.round(selected.priceCents / 100))} en boek`}
              </Button>
              <p className="text-text-muted text-xs text-center">
                {/* COPY: confirm met Marlon */}
                {isCode
                  ? "Met je proefcode is de les gratis en staat je plek direct vast."
                  : isFree
                    ? "Tijdens onze openingsperiode is je proefles gratis en staat je plek direct vast. Een gratis proefles per persoon."
                    : "Je wordt doorgestuurd naar Mollie om veilig te betalen."}
              </p>
            </form>
          </div>
        </ScrollReveal>
      )}
    </>
  );

  if (embedded) return <div>{body}</div>;

  return (
    <Section className="pt-32 md:pt-40 min-h-[80vh]">
      <Container className="max-w-3xl">{body}</Container>
    </Section>
  );
}

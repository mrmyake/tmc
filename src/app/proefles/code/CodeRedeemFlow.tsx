"use client";

import { useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";
import {
  validateTrialCode,
  redeemTrialCodeBooking,
} from "@/lib/actions/trial-code-booking";
import { trackLead, trackFormStart } from "@/lib/analytics";

export interface TrialCodeSessionOption {
  id: string;
  startAt: string;
  endAt: string;
  pillar: string;
  pillarLabel: string;
  className: string;
  trainerName: string;
  /** NULL betekent onbeperkt (alleen kettlebell). */
  spotsAvailable: number | null;
}

type Step = "code" | "session" | "form" | "done";

interface DoneResult {
  className: string;
  whenLabel: string;
  cancelToken: string;
}

function normalizeCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

export function CodeRedeemFlow({
  options: initialOptions,
}: {
  options: TrialCodeSessionOption[];
}) {
  const [step, setStep] = useState<Step>("code");
  const [options, setOptions] = useState(initialOptions);
  const [code, setCode] = useState("");
  const [pillar, setPillar] = useState<string | null>(null);
  const [codeError, setCodeError] = useState("");
  const [sessionMessage, setSessionMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formStarted, setFormStarted] = useState(false);
  const [done, setDone] = useState<DoneResult | null>(null);

  const selected = options.find((o) => o.id === selectedId) ?? null;
  const filteredOptions = pillar
    ? options.filter((o) => o.pillar === pillar)
    : options;

  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setCodeError("");
    const result = await validateTrialCode(code);
    setBusy(false);
    if (!result.ok) {
      setCodeError(result.message);
      return;
    }
    setPillar(result.pillar);
    setStep("session");
  }

  function chooseSession(id: string) {
    setSelectedId(id);
    setSessionMessage("");
    setStep("form");
  }

  async function submitForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setFormError("");

    const result = await redeemTrialCodeBooking({
      sessionId: selected.id,
      name,
      email,
      phone,
    });

    setBusy(false);

    if (!result.ok) {
      if (result.step === "restart") {
        setCode("");
        setPillar(null);
        setSelectedId(null);
        setCodeError(result.message);
        setStep("code");
        return;
      }
      if (result.step === "retry_session") {
        // De net geprobeerde sessie bleek niet (meer) bruikbaar; lokaal
        // uit de lijst halen voorkomt dat 'm meteen weer wordt gekozen
        // zonder een nieuwe paginalaad.
        setOptions((prev) => prev.filter((o) => o.id !== selected.id));
        setSelectedId(null);
        setSessionMessage(result.message);
        setStep("session");
        return;
      }
      setFormError(result.message);
      return;
    }

    trackLead("trial_code_booking");
    setDone({
      className: result.className,
      whenLabel: result.whenLabel,
      cancelToken: result.cancelToken,
    });
    setStep("done");
  }

  return (
    <Section className="pt-32 md:pt-40 min-h-[80vh] flex items-center">
      <Container className="max-w-3xl">
        {step === "code" && (
          <ScrollReveal>
            <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
              <span aria-hidden className="w-12 h-px bg-accent" />
              {/* COPY: confirm met Marlon */}
              Gratis · Met code
              <span aria-hidden className="w-12 h-px bg-accent" />
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              {/* COPY: confirm met Marlon */}
              Vul je code in
            </h1>
            <p className="text-text-muted text-lg leading-relaxed mb-10 max-w-xl">
              {/* COPY: confirm met Marlon */}
              Heb je een code van Marlon gekregen voor een gratis proefles?
              Vul &apos;m hieronder in.
            </p>

            <form onSubmit={submitCode} className="max-w-sm space-y-6">
              <Field label="Code">
                <input
                  type="text"
                  required
                  autoComplete="off"
                  autoCapitalize="characters"
                  value={code}
                  onChange={(e) => setCode(normalizeCodeInput(e.target.value))}
                  className={`${fieldInputClasses} font-mono tracking-[0.1em]`}
                  // COPY: confirm met Marlon
                  placeholder="BV. AB3D9F2K"
                />
              </Field>

              {codeError && (
                <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
                  {codeError}
                </div>
              )}

              <Button
                type="submit"
                className={`w-full text-center ${busy ? "opacity-50 pointer-events-none" : ""}`}
              >
                {/* COPY: confirm met Marlon */}
                {busy ? "Bezig..." : "Code controleren"}
              </Button>
            </form>
          </ScrollReveal>
        )}

        {step === "session" && (
          <ScrollReveal>
            <button
              type="button"
              onClick={() => {
                setStep("code");
                setCodeError("");
              }}
              className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent mb-8"
            >
              {/* COPY: confirm met Marlon */}
              &larr; Andere code
            </button>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              {/* COPY: confirm met Marlon */}
              Kies je sessie
            </h1>

            {sessionMessage && (
              <div className="mb-6 text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
                {sessionMessage}
              </div>
            )}

            {filteredOptions.length === 0 ? (
              <div className="bg-bg-elevated p-8 text-center">
                {/* COPY: confirm met Marlon */}
                <p className="text-text-muted text-sm">
                  Op dit moment zijn er geen sessies met een vrije plek
                  beschikbaar voor je code. Neem contact op met Marlon, dan
                  plannen we iets samen.
                </p>
              </div>
            ) : (
              <ul className="border-t border-[color:var(--ink-500)]/60">
                {filteredOptions.map((o) => (
                  <li
                    key={o.id}
                    className="border-b border-[color:var(--ink-500)]/40"
                  >
                    <button
                      type="button"
                      onClick={() => chooseSession(o.id)}
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
                      <p className="text-text-muted text-xs shrink-0">
                        {o.spotsAvailable === null
                          ? // COPY: confirm met Marlon
                            "Onbeperkt aantal plekken"
                          : `${o.spotsAvailable} ${o.spotsAvailable === 1 ? "plek" : "plekken"}`}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollReveal>
        )}

        {step === "form" && selected && (
          <ScrollReveal>
            <div className="bg-bg-elevated p-8 md:p-10 relative">
              <div
                aria-hidden
                className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setStep("session");
                }}
                className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent mb-6"
              >
                {/* COPY: confirm met Marlon */}
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
              </p>

              <form onSubmit={submitForm} className="space-y-6">
                <Field label="Naam">
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onFocus={() => {
                      if (!formStarted) {
                        trackFormStart("trial_code_booking_form");
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
                <Field label="Telefoon">
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={fieldInputClasses}
                  />
                </Field>

                {formError && (
                  <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
                    {formError}
                  </div>
                )}

                <Button
                  type="submit"
                  className={`w-full text-center ${busy ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {/* COPY: confirm met Marlon */}
                  {busy ? "Bezig..." : "Boek mijn gratis proefles"}
                </Button>
              </form>
            </div>
          </ScrollReveal>
        )}

        {step === "done" && done && (
          <ScrollReveal>
            <div className="text-center">
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-6">
                {/* COPY: confirm met Marlon */}
                Bevestigd
              </span>
              <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
                {/* COPY: confirm met Marlon */}
                Je proefles staat vast.
              </h1>
              <p className="text-text-muted text-lg mb-3">
                {done.className} &middot; {done.whenLabel}
              </p>
              <p className="text-text-muted mb-3">
                {/* COPY: confirm met Marlon */}
                Je ontvangt een bevestiging per mail. Tot in de studio.
              </p>
              <p className="text-text-muted text-sm mb-10">
                {/* COPY: confirm met Marlon */}
                Kan je toch niet? Annuleer via{" "}
                <Link
                  href={`/proefles/annuleren/${done.cancelToken}`}
                  className="text-accent hover:underline"
                >
                  deze link
                </Link>
                . Bewaar &apos;m, hij staat niet nogmaals in een mail.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button href="/">
                  {/* COPY: confirm met Marlon */}
                  Terug naar home
                </Button>
              </div>
            </div>
          </ScrollReveal>
        )}
      </Container>
    </Section>
  );
}

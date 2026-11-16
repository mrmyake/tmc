"use client";

import { useId, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ProeflesContent } from "./ProeflesContent";
import { trackCTA } from "@/lib/analytics";
import { pushDataLayer } from "@/lib/data-layer";
import { withAttribution, type AttributionParams } from "@/lib/attribution/params";
import { checkTrialCode } from "@/lib/actions/trial-code";
import { normalizeTrialCode } from "@/lib/trial-codes/normalize";
import { CODE_RATE_LIMITED_MESSAGE } from "@/lib/trial-codes/messages";

/**
 * Organische /proefles (spec-proefles-funnel.md, besluit 16-11-2026; vervangt
 * de drie gelijke kaarten van 30-09-2026). Eén hoofdactie: de betaalde
 * proefles, met de prijs uit tmc.catalogue. Daaronder klein het
 * terugbelverzoek en een invulveld voor wie een code heeft. Nergens op deze
 * pagina staat een code: gratis campagnes lopen via /actie/[slug].
 *
 * attribution: advertentie- en campagneparameters uit de URL van deze pagina
 * (spec-marketing-attribution.md). De knop en de codestap dragen ze mee in
 * hun links en het terugbelformulier stuurt ze mee.
 */

// COPY: confirm met Marlon
const BULLETS = [
  "Kies zelf je les uit het rooster en betaal direct online",
  "Maximaal 8 per yogales, maximaal 12 bij kettlebell",
  "Matten liggen klaar, parkeren voor de deur",
];

// COPY: confirm met Marlon
const STEPS = [
  { title: "Kies je les", text: "Groepsles of een uur vrij trainen met Marlon erbij." },
  { title: "Betaal online", text: "Je krijgt direct een bevestiging per mail." },
  { title: "Kom 10 minuten eerder", text: "Dan laten we je rustig de studio zien." },
];

// De score is een vaste tekst, geen live widget (spec-proefles-funnel.md, B13).
// COPY: confirm met Marlon
const GOOGLE_SCORE_TEXT = "5.0 op Google, 25+ reviews";

// COPY: confirm met Marlon
const CODE_VALID_MESSAGE = "Code geaccepteerd. Je proefles is gratis, kies nu je les.";
// Eén tekst voor bestaat niet, ingetrokken, op en verlopen: de bezoeker mag
// niet kunnen afleiden waarom een code niet werkt.
// COPY: confirm met Marlon
const CODE_FAILED_MESSAGE =
  "Deze code werkt niet (meer). Controleer de code of kies een andere optie.";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function ProeflesChoice({
  attribution = {},
  priceLabel = null,
  portraitUrl = null,
  initialChoice = "none",
}: {
  attribution?: AttributionParams;
  /** Prijs van de betaalde proefles, al opgemaakt, uit tmc.catalogue; null = niet tonen. */
  priceLabel?: string | null;
  /** Portret van Marlon uit Sanity (trainer.photo); null = geen foto. */
  portraitUrl?: string | null;
  /** "call" opent het terugbelformulier direct (?kaart=bellen). */
  initialChoice?: "none" | "call";
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<"none" | "call">(initialChoice);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [navigating, startTransition] = useTransition();
  const [codeError, setCodeError] = useState("");
  const [codeOk, setCodeOk] = useState(false);
  const codeFieldId = useId();
  const codeMessageId = useId();

  if (choice === "call") {
    return <ProeflesContent attribution={attribution} onBack={() => setChoice("none")} />;
  }

  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || navigating || !code) return;
    setBusy(true);
    setCodeError("");
    // Zelfde server action als de codestap op /proefles/code: de IP-poort, de
    // opzoeking en het ondertekende cookie. De code zelf gaat nooit mee in
    // een haakje of een URL.
    const result = await checkTrialCode(code);
    setBusy(false);
    if (!result.ok) {
      pushDataLayer("proefles_code_submit", { result: "invalid" });
      setCodeError(
        result.message === CODE_RATE_LIMITED_MESSAGE ? result.message : CODE_FAILED_MESSAGE,
      );
      return;
    }
    pushDataLayer("proefles_code_submit", { result: "valid" });
    setCodeOk(true);
    startTransition(() => router.push(withAttribution("/proefles/code", attribution)));
  }

  const pending = busy || navigating;

  return (
    <Section className="pt-32 md:pt-40">
      <Container className="max-w-6xl">
        <div className="grid grid-cols-1 gap-12 min-[900px]:grid-cols-2 min-[900px]:gap-16 items-start">
          {/* Links: tekst en, vanaf 900 px, het portret */}
          <div>
            <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
              <span aria-hidden className="w-12 h-px bg-accent" />
              {/* COPY: confirm met Marlon */}
              Proefles
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-stone-100 mb-6 leading-[1.05] tracking-[-0.02em]">
              {/* COPY: confirm met Marlon */}
              Kom een les proberen.
            </h1>
            <p className="text-stone-100/62 text-lg leading-relaxed max-w-xl">
              {/* COPY: confirm met Marlon */}
              Yoga, mobility, kettlebell of vrij trainen. Kleine groepen en
              echte coaching, in een rustige studio in Loosdrecht.
            </p>
            {portraitUrl && (
              <div className="relative hidden min-[900px]:block mt-10 h-[300px] w-full overflow-hidden rounded-[8px]">
                <Image
                  src={portraitUrl}
                  alt="Trainer Marlon in de studio"
                  fill
                  sizes="(min-width: 900px) 520px, 1px"
                  className="object-cover object-[center_25%]"
                />
              </div>
            )}
          </div>

          {/* Rechts: de hoofdkaart en de kleine opties */}
          <div>
            <div className="rounded-[8px] border-t-2 border-accent bg-[#171412] p-7 md:p-9">
              <div className="flex items-start justify-between gap-6 mb-6">
                <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-stone-100 tracking-[-0.01em]">
                  {/* COPY: confirm met Marlon */}
                  Boek je proefles
                </h2>
                {priceLabel && (
                  <div className="text-right shrink-0">
                    <div className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-accent leading-none">
                      {priceLabel}
                    </div>
                    <div className="mt-2 text-xs text-stone-100/62">
                      {/* COPY: confirm met Marlon */}
                      eenmalig, geen abonnement
                    </div>
                  </div>
                )}
              </div>

              <ul className="mb-8 divide-y divide-stone-100/14 border-y border-stone-100/14">
                {BULLETS.map((bullet) => (
                  <li key={bullet} className="flex items-baseline gap-4 py-3.5">
                    <span aria-hidden className="h-px w-4 shrink-0 translate-y-[-4px] bg-accent" />
                    <span className="text-sm leading-relaxed text-stone-100">{bullet}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={withAttribution("/proefles/boeken", attribution)}
                onClick={() => {
                  // Bestaand GA4-event, ongewijzigd label (eventregister).
                  trackCTA("Boek direct", "/proefles");
                  pushDataLayer("proefles_cta_click", { variant: "organic" });
                }}
                className={`flex min-h-[54px] w-full items-center justify-center rounded-[4px] bg-accent px-6 text-[15px] font-semibold text-ink-900 transition-colors duration-300 hover:bg-accent-hover ${FOCUS_RING}`}
              >
                {/* COPY: confirm met Marlon */}
                Boek je proefles
              </Link>

              <p className="mt-5 flex items-center justify-center gap-2 text-sm text-stone-100/62">
                <span aria-hidden className="text-accent tracking-[0.1em]">
                  ★★★★★
                </span>
                {GOOGLE_SCORE_TEXT}
              </p>
            </div>

            {/* Klein, onder de kaart: bellen en de code */}
            <div className="mt-6 px-1">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4">
                <span className="text-sm text-stone-100/62">
                  {/* COPY: confirm met Marlon */}
                  Liever eerst bellen?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    // Bestaand GA4-event, ongewijzigd label (eventregister).
                    trackCTA("Liever gebeld worden", "/proefles");
                    pushDataLayer("proefles_callback_open");
                    setChoice("call");
                  }}
                  className={`cursor-pointer rounded-[4px] text-sm text-stone-100 underline underline-offset-4 decoration-stone-100/40 transition-colors hover:text-accent hover:decoration-accent ${FOCUS_RING}`}
                >
                  {/* COPY: confirm met Marlon */}
                  Marlon belt je terug
                </button>
              </div>

              <div className="border-t border-stone-100/14 py-4">
                <form onSubmit={submitCode} noValidate>
                  <label htmlFor={codeFieldId} className="block text-sm text-stone-100/62 mb-3">
                    {/* COPY: confirm met Marlon */}
                    Heb je een code?
                  </label>
                  <div className="flex gap-3">
                    <input
                      id={codeFieldId}
                      type="text"
                      name="proefcode"
                      value={code}
                      onChange={(e) => {
                        setCode(normalizeTrialCode(e.target.value).slice(0, 32));
                        if (codeError) setCodeError("");
                      }}
                      // COPY: confirm met Marlon
                      placeholder="Vul je code in"
                      autoComplete="off"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-invalid={codeError ? true : undefined}
                      aria-describedby={codeError || codeOk ? codeMessageId : undefined}
                      className={`min-h-[54px] min-w-0 flex-1 rounded-[4px] border border-stone-100/14 bg-transparent px-4 font-mono text-base uppercase tracking-[0.08em] text-stone-100 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-stone-100/40 transition-colors focus:border-accent ${FOCUS_RING}`}
                    />
                    <button
                      type="submit"
                      disabled={pending || !code}
                      className={`min-h-[54px] shrink-0 cursor-pointer rounded-[4px] border border-stone-100/14 px-5 text-sm font-semibold text-stone-100 transition-colors hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-50 disabled:hover:border-stone-100/14 disabled:hover:text-stone-100 ${FOCUS_RING}`}
                    >
                      {/* COPY: confirm met Marlon */}
                      {pending ? "Bezig..." : "Toepassen"}
                    </button>
                  </div>
                  <p
                    id={codeMessageId}
                    role={codeError ? "alert" : "status"}
                    className={`mt-3 text-sm ${codeError ? "text-[color:var(--danger)]" : "text-accent"} ${codeError || codeOk ? "" : "hidden"}`}
                  >
                    {codeError || (codeOk ? CODE_VALID_MESSAGE : "")}
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Zo werkt het */}
        <div className="mt-20 md:mt-28 border-t border-stone-100/14 pt-12">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.3em] text-accent mb-10">
            {/* COPY: confirm met Marlon */}
            Zo werkt het
          </h2>
          <ol className="grid grid-cols-1 gap-10 min-[900px]:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-5">
                <span
                  aria-hidden
                  className="font-[family-name:var(--font-playfair)] text-3xl leading-none text-accent"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-base font-medium text-stone-100 mb-2">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-stone-100/62">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  );
}

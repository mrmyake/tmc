"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { trackFormStart, trackLead } from "@/lib/analytics";
import { startTrialBooking } from "@/lib/actions/trial-booking";
import { startOpeningTrialBooking } from "@/lib/actions/opening-trial";
import {
  amsterdamParts,
  formatWeekdayDate,
  parseIsoDateToAmsterdamMidnight,
} from "@/lib/format-date";
import { returnTargetForThisClient } from "@/lib/native/checkout";
import { presenceForWeekday } from "@/lib/presence";
import { QUARTER_MS, type QuarterCell } from "@/lib/member/vrij-trainen-slots";
import type { VisitorSlotData } from "@/lib/trial-codes/vrij-trainen-query";
import type { TrialCodeScope } from "@/lib/trial-codes/scope";
import { SlotDayStrip } from "@/app/app/rooster/_components/vrij-trainen/SlotDayStrip";
import { SlotGrid } from "@/app/app/rooster/_components/vrij-trainen/SlotGrid";
import { SlotFooter } from "@/app/app/rooster/_components/vrij-trainen/SlotFooter";
import { useSlotSelection } from "@/app/app/rooster/_components/vrij-trainen/useSlotSelection";
import { CodeInfoBanner } from "../_components/CodeInfoBanner";
import { leadAttributionForSubmit } from "@/lib/attribution/consent";
import { withAttribution, type AttributionParams } from "@/lib/attribution/params";

/** Een proefuur vrij trainen is altijd precies een uur; de server dwingt dat af. */
const DURATION_MINUTES = 60;

type Props = {
  data: VisitorSlotData;
  /**
   * Advertentie- en campagneparameters uit de URL van de pagina
   * (spec-marketing-attribution.md); reizen mee in de dagstrip en gaan met de
   * bannerkeuze mee in de action-input.
   */
  attribution?: AttributionParams;
} & (
  | {
      /** Codeflow (standaard): een code met scope vrij trainen uit het cookie. */
      variant?: "code";
      code: string;
      scope: TrialCodeScope;
      onChangeCode: () => void;
      onCodeInvalid: (message: string) => void;
    }
  | {
      /**
       * Gratis openingsperiode (/proefles/gratis): geen code, eigen actie
       * (startOpeningTrialBooking) en de dagstrip linkt terug naar de
       * gratis pagina. De pagina heeft zelf al een kop.
       */
      variant: "opening";
    }
);

/**
 * Stap 2 van de codeflow voor een code met scope vrij trainen, en de
 * vrij-trainen-tak van de gratis openingsflow: dezelfde dagstrip, hetzelfde
 * kwartierraster (quarterCells, groupByHour, SlotGrid) en dezelfde voet als de
 * ledenkiezer op /app/rooster, maar met een vast uur, alleen de uren waarin
 * Marlon er is (tmc.trainer_presence_windows) en een gegevensformulier in
 * plaats van een lidaccount. Dit is weergave: scope of periode, venster, duur,
 * kwartier en de maxima worden bij het boeken opnieuw server-side gecontroleerd
 * door tmc.redeem_trial_code of tmc.book_opening_trial.
 */
export function VisitorSlotPicker(props: Props) {
  const { data, attribution = {} } = props;
  const isOpening = props.variant === "opening";
  const router = useRouter();
  const [selection, setSelection] = useState<{ date: string; start: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formStarted, setFormStarted] = useState(false);

  const { rows, selected, selectedStartMs, slotQuarterMs } = useSlotSelection({
    quarters: data.quarters,
    duration: DURATION_MINUTES,
    selectedDate: data.selectedDate,
    selection,
  });

  const dayDate = parseIsoDateToAmsterdamMidnight(data.selectedDate)!;
  const weekday = amsterdamParts(dayDate).weekday;
  const dayPresence = {
    // COPY: confirm met Marlon
    name: "Marlon",
    ...presenceForWeekday(data.presence, weekday),
  };

  const footerSelection =
    selectedStartMs !== null
      ? { startMs: selectedStartMs, endMs: selectedStartMs + (DURATION_MINUTES / 15) * QUARTER_MS }
      : null;
  const canBook =
    Boolean(data.session) &&
    Boolean(selected) &&
    name.trim() !== "" &&
    email.trim() !== "" &&
    phone.trim() !== "";

  function onSelect(cell: QuarterCell) {
    setError("");
    setSelection({ date: data.selectedDate, start: cell.quarterStart });
  }

  async function book() {
    if (!data.session || !selected) return;
    if (!canBook) {
      // COPY: confirm met Marlon
      setError("Vul je naam, e-mailadres en telefoonnummer in.");
      return;
    }
    setBusy(true);
    setError("");

    if (props.variant === "opening") {
      const result = await startOpeningTrialBooking({
        sessionId: data.session.id,
        slotStartAt: selected,
        name,
        email,
        phone,
        attribution: leadAttributionForSubmit(attribution),
      });
      if (!result.ok) {
        setBusy(false);
        if (result.step === "period") {
          window.location.assign("/proefles");
          return;
        }
        if (result.step === "session") {
          // Het uur is niet meer beschikbaar (iemand was eerder, quotum vol
          // of buiten de regels): raster opnieuw laden, keuze wissen.
          setSelection(null);
          setError(result.error);
          router.refresh();
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
      sessionId: data.session.id,
      slotStartAt: selected,
      name,
      email,
      phone,
      mode: "code",
      returnTarget: returnTargetForThisClient(),
      attribution: leadAttributionForSubmit(attribution),
    });
    if (!result.ok) {
      setBusy(false);
      if (result.step === "code") {
        props.onCodeInvalid(result.error);
        return;
      }
      if (result.step === "session") {
        // Het uur is niet meer beschikbaar (iemand was eerder, of buiten de
        // regels): raster opnieuw laden, keuze wissen, code blijft geldig.
        setSelection(null);
        setError(result.error);
        router.refresh();
        return;
      }
      setError(result.error);
      return;
    }
    if (result.free) {
      // Bestaand event, waarde 0 (spec-analytics.md eventregister).
      trackLead("trial_booking", 0);
      window.location.assign(result.redirectUrl);
    }
  }

  // COPY: confirm met Marlon
  const summary = `${formatWeekdayDate(dayDate)} · 1 uur`;

  const body = (
    <>
      {!isOpening && (
        <>
          <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
            <span aria-hidden className="w-12 h-px bg-accent" />
            {/* COPY: confirm met Marlon */}
            Gratis · Met proefcode
            <span aria-hidden className="w-12 h-px bg-accent" />
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
            {/* COPY: confirm met Marlon */}
            Kies je moment
          </h1>
        </>
      )}
      {props.variant !== "opening" && (
        <CodeInfoBanner code={props.code} scope={props.scope} onChangeCode={props.onChangeCode} />
      )}

      <div className="mb-6">
        <SlotDayStrip
          days={data.days}
          selectedDate={data.selectedDate}
          hrefFor={(iso) =>
            withAttribution(
              isOpening ? `/proefles/gratis?soort=vrij&dag=${iso}` : `/proefles/code?dag=${iso}`,
              attribution,
            )
          }
        />
      </div>

      {!data.session ? (
        <p className="text-text-muted text-sm py-8">
          {/* COPY: confirm met Marlon */}
          Er zijn de komende weken geen uren beschikbaar waarop Marlon er is. Neem contact met
          ons op.
        </p>
      ) : (
        <>
          <p className="text-text-muted text-sm mb-5">
            {isOpening
              ? // COPY: confirm met Marlon
                "Kies een starttijd. Je traint een vast uur, gratis, en alleen op de uren waarop Marlon er is. Per uur zijn er vier gratis proefplekken."
              : // COPY: confirm met Marlon
                "Kies een starttijd. Je traint een vast uur, en alleen op de uren waarop Marlon er is."}
          </p>
          <SlotGrid
            rows={rows}
            weekday={weekday}
            presence={dayPresence}
            selectedStartMs={selectedStartMs}
            slotQuarterMs={slotQuarterMs}
            onSelect={onSelect}
          />

          {selected && (
            <form
              className="mt-10 bg-bg-elevated p-6 md:p-8 space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                void book();
              }}
            >
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text">
                {/* COPY: confirm met Marlon */}
                Je gegevens
              </h2>
              <div className="grid gap-5 md:grid-cols-3">
                {/* COPY: confirm met Marlon */}
                <Field label="Naam">
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => {
                      if (!formStarted) {
                        setFormStarted(true);
                        trackFormStart("trial_booking_form");
                      }
                      setName(e.target.value);
                    }}
                    className={fieldInputClasses}
                  />
                </Field>
                {/* COPY: confirm met Marlon */}
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
                {/* COPY: confirm met Marlon */}
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
              </div>
              <p className="text-sm text-text-muted">{summary}</p>
              <SlotFooter
                layout="panel"
                summary={summary}
                selection={footerSelection}
                pending={busy}
                onBook={() => void book()}
              />
              <p className="text-text-muted text-xs">
                {isOpening
                  ? // COPY: confirm met Marlon
                    "Tijdens onze openingsperiode is het uur gratis en staat je plek direct vast. Een gratis proefles per persoon. Marlon ontvangt je bij de deur."
                  : // COPY: confirm met Marlon
                    "Met je proefcode is het uur gratis en staat je plek direct vast."}
              </p>
            </form>
          )}

          {error && (
            <div
              role="alert"
              className="mt-6 text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3"
            >
              {error}
            </div>
          )}
        </>
      )}
    </>
  );

  if (isOpening) return <div>{body}</div>;

  return (
    <Section className="pt-32 md:pt-40 min-h-[80vh]">
      <Container className="max-w-3xl">{body}</Container>
    </Section>
  );
}

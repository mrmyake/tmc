"use client";

import { useEffect, useState, useTransition } from "react";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import type { CustomerProfile } from "@/lib/admin/customer-core";
import type { PtCreditSummary } from "@/lib/admin/pt-credit-summary";
import {
  bookPtForMember,
  type BookPtForMemberResult,
} from "@/lib/admin/pt-booking-actions";
import { zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { BusyDayPanel } from "./BusyDayPanel";
import { OverrideWarning } from "./OverrideWarning";
import { SuccessBanner } from "./SuccessBanner";

interface LosseSessieFormProps {
  trainerId: string;
  customer: CustomerProfile;
  creditSummary: PtCreditSummary | null;
}

type DurationChoice = "30" | "45" | "60" | "90" | "custom";
type PaymentMode = "credits" | "payment_link" | "already_paid";

const DURATION_CHOICES: DurationChoice[] = ["30", "45", "60", "90", "custom"];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * PT-agenda C2, keuze 1: losse sessie via admin_book_pt_for_member.
 * Vrije duur, optioneel duo met introducee, optionele wekelijkse reeks,
 * en de twee losse override-meldingen bij pt_overlap/pt_no_turnaround.
 */
export function LosseSessieForm({
  trainerId,
  customer,
  creditSummary,
}: LosseSessieFormProps) {
  const [format, setFormat] = useState<"one_on_one" | "duo">("one_on_one");
  const [introduceeName, setIntroduceeName] = useState("");
  const [durationChoice, setDurationChoice] = useState<DurationChoice>("60");
  const [customDuration, setCustomDuration] = useState("60");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("09:00");
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState("4");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("already_paid");

  const [allowOverlap, setAllowOverlap] = useState(false);
  const [allowNoTurnaround, setAllowNoTurnaround] = useState(false);
  const [overlapConflictAt, setOverlapConflictAt] = useState<string | null>(
    null,
  );
  const [turnaroundConflictAt, setTurnaroundConflictAt] = useState<
    string | null
  >(null);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [result, setResult] = useState<
    Extract<BookPtForMemberResult, { ok: true }> | null
  >(null);
  const [pending, startTransition] = useTransition();

  const relevantCredit = format === "duo" ? creditSummary?.duo : creditSummary?.pt;
  const creditsAvailable = (relevantCredit?.creditsRemaining ?? 0) > 0;
  const repeatCount = repeatEnabled ? Math.max(1, Number(repeatWeeks) || 1) : 1;
  const paymentLinkAllowed = repeatCount <= 1;

  // Overrides zijn per handeling: elke wijziging aan wat en wanneer er
  // geboekt wordt annuleert eerder getoonde conflicten en vinkjes.
  useEffect(() => {
    setAllowOverlap(false);
    setAllowNoTurnaround(false);
    setOverlapConflictAt(null);
    setTurnaroundConflictAt(null);
  }, [format, date, time, durationChoice, customDuration, repeatEnabled, repeatWeeks]);

  useEffect(() => {
    if (paymentMode === "credits" && !creditsAvailable) {
      setPaymentMode("already_paid");
    }
    if (paymentMode === "payment_link" && !paymentLinkAllowed) {
      setPaymentMode(creditsAvailable ? "credits" : "already_paid");
    }
  }, [paymentMode, creditsAvailable, paymentLinkAllowed]);

  const durationMin =
    durationChoice === "custom" ? Number(customDuration) : Number(durationChoice);

  function handleSubmit() {
    setGenericError(null);
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const startAt = zonedWallClockToUtc(year, month, day, hour, minute);

    startTransition(async () => {
      const res = await bookPtForMember({
        profileId: customer.id,
        trainerId,
        startAt: startAt.toISOString(),
        format,
        paymentMode,
        durationMin,
        introduceeName:
          format === "duo" && introduceeName.trim()
            ? introduceeName.trim()
            : undefined,
        allowOverlap,
        allowNoTurnaround,
        repeatWeeks: repeatCount,
      });

      if (!res.ok) {
        if (res.reason === "pt_overlap") {
          setOverlapConflictAt(res.conflictAt ?? "");
        } else if (res.reason === "pt_no_turnaround") {
          setTurnaroundConflictAt(res.conflictAt ?? "");
        } else {
          setOverlapConflictAt(null);
          setTurnaroundConflictAt(null);
          setGenericError(res.message);
        }
        return;
      }

      setOverlapConflictAt(null);
      setTurnaroundConflictAt(null);
      setResult(res);
    });
  }

  if (result) {
    const first = new Date(result.bookings[0].startAt);
    const firstEnd = new Date(result.bookings[0].endAt);
    return (
      <SuccessBanner
        // COPY: confirm met Marlon
        title="Sessie geboekt."
        detail={`${formatWeekdayDate(first)} · ${formatTimeRange(first, firstEnd)}${
          result.bookings.length > 1
            ? ` · ${result.bookings.length} sessies (wekelijks)`
            : ""
        }`}
        payUrl={result.payUrl}
        warning={result.warning}
        onReset={() => setResult(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <AdminField label="Format">
          <div className="flex gap-2">
            {(["one_on_one", "duo"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
                className={`flex-1 px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border transition-colors cursor-pointer ${
                  format === f
                    ? "bg-accent text-bg border-accent"
                    : "border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {/* COPY: confirm met Marlon */}
                {f === "one_on_one" ? "1-op-1" : "Duo"}
              </button>
            ))}
          </div>
        </AdminField>

        <AdminField label="Duur (min)">
          <div className="flex gap-1.5 flex-wrap">
            {DURATION_CHOICES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDurationChoice(d)}
                aria-pressed={durationChoice === d}
                className={`px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border transition-colors cursor-pointer ${
                  durationChoice === d
                    ? "bg-accent text-bg border-accent"
                    : "border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {/* COPY: confirm met Marlon */}
                {d === "custom" ? "Vrij" : d}
              </button>
            ))}
          </div>
        </AdminField>
      </div>

      {durationChoice === "custom" && (
        <AdminField label="Duur (minuten)" hint="Tussen 1 en 480 minuten.">
          <AdminInput
            type="number"
            min={1}
            max={480}
            value={customDuration}
            onChange={(e) => setCustomDuration(e.target.value)}
          />
        </AdminField>
      )}

      {format === "duo" && (
        <AdminField label="Naam introducee" hint="Optioneel.">
          <AdminInput
            type="text"
            value={introduceeName}
            onChange={(e) => setIntroduceeName(e.target.value)}
          />
        </AdminField>
      )}

      <div className="grid grid-cols-2 gap-4">
        <AdminField label="Datum">
          <AdminInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </AdminField>
        <AdminField label="Tijd">
          <AdminInput
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </AdminField>
      </div>

      <BusyDayPanel trainerId={trainerId} dateIso={date} />

      <AdminField label="Herhaling">
        <label className="flex items-center gap-2 text-sm text-text cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={repeatEnabled}
            onChange={(e) => setRepeatEnabled(e.target.checked)}
            className="cursor-pointer"
          />
          {/* COPY: confirm met Marlon */}
          <span>Wekelijkse reeks, zelfde dag en tijd</span>
        </label>
        {repeatEnabled && (
          <AdminInput
            type="number"
            min={2}
            max={26}
            value={repeatWeeks}
            onChange={(e) => setRepeatWeeks(e.target.value)}
            className="w-32"
          />
        )}
      </AdminField>

      <AdminField label="Betaling">
        <div className="flex flex-col gap-2">
          <label
            className={`flex items-center gap-2 text-sm px-4 py-3 border cursor-pointer ${
              paymentMode === "credits"
                ? "border-accent text-text"
                : "border-[color:var(--ink-500)] text-text-muted"
            } ${!creditsAvailable ? "opacity-40 pointer-events-none" : ""}`}
          >
            <input
              type="radio"
              name="paymentMode"
              checked={paymentMode === "credits"}
              disabled={!creditsAvailable}
              onChange={() => setPaymentMode("credits")}
            />
            {/* COPY: confirm met Marlon */}
            <span>
              Credit van de klant
              {relevantCredit
                ? ` (${relevantCredit.creditsRemaining} beschikbaar)`
                : " (geen tegoed)"}
            </span>
          </label>
          <label
            className={`flex items-center gap-2 text-sm px-4 py-3 border cursor-pointer ${
              paymentMode === "payment_link"
                ? "border-accent text-text"
                : "border-[color:var(--ink-500)] text-text-muted"
            } ${!paymentLinkAllowed ? "opacity-40 pointer-events-none" : ""}`}
          >
            <input
              type="radio"
              name="paymentMode"
              checked={paymentMode === "payment_link"}
              disabled={!paymentLinkAllowed}
              onChange={() => setPaymentMode("payment_link")}
            />
            {/* COPY: confirm met Marlon */}
            <span>
              Mollie-betaallink
              {!paymentLinkAllowed && " (niet mogelijk bij een reeks)"}
            </span>
          </label>
          <label
            className={`flex items-center gap-2 text-sm px-4 py-3 border cursor-pointer ${
              paymentMode === "already_paid"
                ? "border-accent text-text"
                : "border-[color:var(--ink-500)] text-text-muted"
            }`}
          >
            <input
              type="radio"
              name="paymentMode"
              checked={paymentMode === "already_paid"}
              onChange={() => setPaymentMode("already_paid")}
            />
            {/* COPY: confirm met Marlon */}
            <span>Reeds betaald (kas of pin)</span>
          </label>
        </div>
      </AdminField>

      {overlapConflictAt !== null && (
        <OverrideWarning
          tone="danger"
          // COPY: confirm met Marlon
          title="Dit moment overlapt met een bestaande sessie."
          detail={
            overlapConflictAt
              ? `Conflict rond ${new Date(overlapConflictAt).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}.`
              : ""
          }
          checked={allowOverlap}
          onCheckedChange={setAllowOverlap}
          checkboxLabel="Toch boeken, ik weet dat dit overlapt"
        />
      )}
      {turnaroundConflictAt !== null && (
        <OverrideWarning
          tone="warning"
          // COPY: confirm met Marlon
          title="Geen omkleedtijd tussen de sessies."
          detail={
            turnaroundConflictAt
              ? `Te krap rond ${new Date(turnaroundConflictAt).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}.`
              : ""
          }
          checked={allowNoTurnaround}
          onCheckedChange={setAllowNoTurnaround}
          checkboxLabel="Toch boeken, zonder omkleedtijd"
        />
      )}
      {genericError && (
        <div
          role="alert"
          className="p-4 border border-[color:var(--danger)]/40 text-sm text-[color:var(--danger)]"
        >
          {genericError}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || (durationChoice === "custom" && !customDuration)}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending
            ? "Bezig..."
            : overlapConflictAt !== null || turnaroundConflictAt !== null
              ? "Opnieuw proberen"
              : "Sessie boeken"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import type { CustomerProfile } from "@/lib/admin/customer-core";
import { planPtProgram } from "@/lib/admin/pt-booking-actions";
import { zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";
import { formatPriceEuro } from "@/lib/member/pt-pricing";
import { BusyDayPanel } from "./BusyDayPanel";
import { SuccessBanner } from "./SuccessBanner";

interface ProgramInfo {
  priceCents: number;
  displayName: string;
}

interface ProgrammaFormProps {
  trainerId: string;
  customer: CustomerProfile;
  studioProgram: ProgramInfo;
  onlineProgram: ProgramInfo;
}

type ProgramType = "studio" | "online";
type PaymentMode = "payment_link" | "already_paid";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toUtcIso(dateIso: string, time: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return zonedWallClockToUtc(year, month, day, hour, minute).toISOString();
}

/**
 * PT-agenda C2, keuze 2: het 12-weken programma via admin_plan_pt_program.
 * Prijs en aantallen komen uitsluitend uit de catalogus (props vanuit de
 * page, tmc.catalogue), nooit client-side berekend. Bij een botsing toont
 * dit de VOLLEDIGE conflictlijst die de RPC teruggeeft; er is geen
 * override hier (admin_plan_pt_program kent er geen), Marlon verschuift
 * de ankertijden en probeert opnieuw.
 */
export function ProgrammaForm({
  trainerId,
  customer,
  studioProgram,
  onlineProgram,
}: ProgrammaFormProps) {
  const [type, setType] = useState<ProgramType>("studio");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("payment_link");

  const [date1, setDate1] = useState(todayIso());
  const [time1, setTime1] = useState("09:00");
  // Studio: tweede wekelijkse moment. Online: het wekelijkse 30-min moment
  // (date1/time1 hierboven is dan de fysieke beginmeting).
  const [date2, setDate2] = useState(todayIso());
  const [time2, setTime2] = useState("18:00");

  const [genericError, setGenericError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<
    Array<{ start_at: string; reason: string }> | null
  >(null);
  const [result, setResult] = useState<{
    totalSessions: number;
    payUrl: string | null;
    warning: string | null;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const program = type === "studio" ? studioProgram : onlineProgram;

  function handleSubmit() {
    setGenericError(null);
    setConflicts(null);

    startTransition(async () => {
      const res = await planPtProgram({
        profileId: customer.id,
        trainerId,
        type,
        // Studio: date1/time1 is anker 1, date2/time2 is anker 2.
        // Online: date2/time2 is het wekelijkse moment, date1/time1 de beginmeting.
        startAt:
          type === "studio" ? toUtcIso(date1, time1) : toUtcIso(date2, time2),
        secondStartAt: type === "studio" ? toUtcIso(date2, time2) : undefined,
        intakeStartAt: type === "online" ? toUtcIso(date1, time1) : undefined,
        paymentMode,
      });

      if (!res.ok) {
        if (res.conflicts && res.conflicts.length > 0) {
          setConflicts(
            [...res.conflicts].sort((a, b) =>
              a.start_at.localeCompare(b.start_at),
            ),
          );
        } else {
          setGenericError(res.message);
        }
        return;
      }

      setResult({
        totalSessions: res.totalSessions,
        payUrl: res.payUrl,
        warning: res.warning,
      });
    });
  }

  if (result) {
    return (
      <SuccessBanner
        // COPY: confirm met Marlon
        title="Programma ingepland."
        detail={`${program.displayName} · ${result.totalSessions} sessies`}
        payUrl={result.payUrl}
        warning={result.warning}
        onReset={() => setResult(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AdminField label="Programma">
        <div className="flex gap-2">
          {(["studio", "online"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={`flex-1 px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border transition-colors cursor-pointer ${
                type === t
                  ? "bg-accent text-bg border-accent"
                  : "border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {/* COPY: confirm met Marlon */}
              {t === "studio" ? "Studio" : "Online"}
            </button>
          ))}
        </div>
      </AdminField>

      <div className="bg-bg border border-[color:var(--ink-500)] p-4 text-sm">
        <p className="text-text mb-1">{program.displayName}</p>
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-xs">
          {formatPriceEuro(program.priceCents)} ·{" "}
          {type === "studio"
            ? "24 sessies, 60 min, 2x per week"
            : "12 sessies online (30 min), 1x per week, plus een fysieke beginmeting van 60 min"}
        </p>
      </div>

      {type === "studio" ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <AdminField label="Eerste wekelijkse moment · datum">
              <AdminInput
                type="date"
                value={date1}
                onChange={(e) => setDate1(e.target.value)}
              />
            </AdminField>
            <AdminField label="Tijd">
              <AdminInput
                type="time"
                value={time1}
                onChange={(e) => setTime1(e.target.value)}
              />
            </AdminField>
          </div>
          <BusyDayPanel trainerId={trainerId} dateIso={date1} />

          <div className="grid grid-cols-2 gap-4">
            <AdminField label="Tweede wekelijkse moment · datum">
              <AdminInput
                type="date"
                value={date2}
                onChange={(e) => setDate2(e.target.value)}
              />
            </AdminField>
            <AdminField label="Tijd">
              <AdminInput
                type="time"
                value={time2}
                onChange={(e) => setTime2(e.target.value)}
              />
            </AdminField>
          </div>
          <BusyDayPanel trainerId={trainerId} dateIso={date2} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            {/* COPY: confirm met Marlon */}
            <AdminField label="Fysieke beginmeting · datum">
              <AdminInput
                type="date"
                value={date1}
                onChange={(e) => setDate1(e.target.value)}
              />
            </AdminField>
            <AdminField label="Tijd">
              <AdminInput
                type="time"
                value={time1}
                onChange={(e) => setTime1(e.target.value)}
              />
            </AdminField>
          </div>
          <BusyDayPanel trainerId={trainerId} dateIso={date1} />

          <div className="grid grid-cols-2 gap-4">
            <AdminField label="Wekelijks moment (online) · datum">
              <AdminInput
                type="date"
                value={date2}
                onChange={(e) => setDate2(e.target.value)}
              />
            </AdminField>
            <AdminField label="Tijd">
              <AdminInput
                type="time"
                value={time2}
                onChange={(e) => setTime2(e.target.value)}
              />
            </AdminField>
          </div>
        </>
      )}

      <AdminField label="Betaling">
        <div className="flex flex-col gap-2">
          <label
            className={`flex items-center gap-2 text-sm px-4 py-3 border cursor-pointer ${
              paymentMode === "payment_link"
                ? "border-accent text-text"
                : "border-[color:var(--ink-500)] text-text-muted"
            }`}
          >
            <input
              type="radio"
              name="programPaymentMode"
              checked={paymentMode === "payment_link"}
              onChange={() => setPaymentMode("payment_link")}
            />
            {/* COPY: confirm met Marlon */}
            <span>Mollie-betaallink, {formatPriceEuro(program.priceCents)} vooraf</span>
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
              name="programPaymentMode"
              checked={paymentMode === "already_paid"}
              onChange={() => setPaymentMode("already_paid")}
            />
            {/* COPY: confirm met Marlon */}
            <span>Reeds betaald (kas of pin)</span>
          </label>
        </div>
      </AdminField>

      {conflicts && conflicts.length > 0 && (
        <div className="p-4 border border-[color:var(--danger)]/40 text-sm">
          {/* COPY: confirm met Marlon */}
          <p className="text-[color:var(--danger)] font-medium mb-3">
            {conflicts.length === 1
              ? "Dit moment botst met een bestaande afspraak."
              : `${conflicts.length} momenten botsen met bestaande afspraken.`}
          </p>
          <ul className="flex flex-col gap-1.5">
            {conflicts.map((c, i) => (
              <li
                key={`${c.start_at}-${i}`}
                className={`flex items-center gap-2 ${
                  c.reason === "pt_overlap"
                    ? "text-[color:var(--danger)]"
                    : "text-[color:var(--warning)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`w-1.5 h-1.5 rounded-full ${
                    c.reason === "pt_overlap"
                      ? "bg-[color:var(--danger)]"
                      : "bg-[color:var(--warning)]"
                  }`}
                />
                <span>
                  {new Date(c.start_at).toLocaleString("nl-NL", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  {/* COPY: confirm met Marlon */}
                  ·{" "}
                  {c.reason === "pt_overlap" ? "overlap" : "geen omkleedtijd"}
                </span>
              </li>
            ))}
          </ul>
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted text-xs mt-3">
            Verschuif de startmomenten en probeer opnieuw.
          </p>
        </div>
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
          disabled={pending}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Bezig..." : "Programma inplannen"}
        </button>
      </div>
    </div>
  );
}

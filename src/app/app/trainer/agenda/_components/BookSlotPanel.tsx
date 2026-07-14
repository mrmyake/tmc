"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { CustomerProfile } from "@/lib/admin/customer-core";
import {
  getPtCreditSummary,
  type PtCreditSummary,
} from "@/lib/admin/pt-credit-summary";
import { KlantPaneel } from "../../boeken/_components/KlantPaneel";
import { LosseSessieForm } from "../../boeken/_components/LosseSessieForm";
import { IntakeForm } from "../../boeken/_components/IntakeForm";

type Mode = "losse_sessie" | "intake";

interface BookSlotPanelProps {
  trainerId: string;
  /** Aangeklikt moment in de agenda (yyyy-mm-dd + HH:mm, gesnapt op 15 min). */
  initialDateIso: string;
  initialTime: string;
  /** C3: betaallinks (tmc.admin_create_order) zijn admin-only. */
  paymentLinksEnabled: boolean;
  onClose: () => void;
}

// COPY: confirm met Marlon
const MODE_TABS: Array<{ id: Mode; label: string }> = [
  { id: "losse_sessie", label: "Losse sessie" },
  { id: "intake", label: "Intake" },
];

/**
 * PT-agenda C4-vervolg: boek-paneel vanuit een kalender-klik op een leeg
 * moment. Hergebruikt de bestaande C2-bouwstenen (KlantPaneel,
 * LosseSessieForm, IntakeForm) zonder ze te dupliceren of hun gedrag op
 * het volledige /app/trainer/boeken-scherm te wijzigen — dit paneel geeft
 * alleen de extra optionele props (initiele datum/tijd, onSuccess) mee
 * die op het bestaande scherm ongebruikt blijven.
 *
 * Bewust alleen Losse sessie en Intake: een 12-weken-programma plant 24
 * of 12 sessies vanaf een startdatum, niet één aangeklikt moment, en
 * houdt zijn eigen ingang op het volledige boek-scherm. Datum/tijd zijn
 * hier gedeelde state (i.p.v. per-form-state zoals op het volledige
 * scherm) zodat wisselen naar Intake dezelfde tijd overneemt.
 */
export function BookSlotPanel({
  trainerId,
  initialDateIso,
  initialTime,
  paymentLinksEnabled,
  onClose,
}: BookSlotPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("losse_sessie");
  const [dateIso, setDateIso] = useState(initialDateIso);
  const [time, setTime] = useState(initialTime);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [creditSummary, setCreditSummary] = useState<PtCreditSummary | null>(
    null,
  );

  useEffect(() => {
    if (!customer) {
      setCreditSummary(null);
      return;
    }
    let cancelled = false;
    setCreditSummary(null);
    getPtCreditSummary(customer.id).then((summary) => {
      if (!cancelled) setCreditSummary(summary);
    });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  function handleDateTimeChange(nextDate: string, nextTime: string) {
    setDateIso(nextDate);
    setTime(nextTime);
  }

  function handleBooked() {
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Sluiten"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full max-w-lg h-full bg-bg-elevated border-l border-[color:var(--ink-500)] overflow-y-auto p-6 md:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="absolute top-6 right-6 text-text-muted hover:text-accent transition-colors cursor-pointer"
        >
          <X size={20} strokeWidth={1.5} />
        </button>

        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {/* COPY: confirm met Marlon */}
          Nieuwe boeking
        </span>
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-6 pr-10">
          {/* COPY: confirm met Marlon */}
          Boek dit moment.
        </h2>

        <div
          role="tablist"
          aria-label="Boekingstype"
          className="flex flex-wrap gap-2 mb-6 border-b border-[color:var(--ink-500)]/60 pb-4"
        >
          {MODE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => setMode(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium uppercase tracking-[0.14em] border transition-colors cursor-pointer ${
                mode === tab.id
                  ? "bg-accent text-bg border-accent"
                  : "border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "losse_sessie" && (
          <div className="flex flex-col gap-6">
            <KlantPaneel
              customer={customer}
              creditSummary={creditSummary}
              onSelect={setCustomer}
              onClear={() => setCustomer(null)}
              onSwitchToIntake={() => setMode("intake")}
            />
            {customer && (
              <LosseSessieForm
                trainerId={trainerId}
                customer={customer}
                creditSummary={creditSummary}
                paymentLinksEnabled={paymentLinksEnabled}
                initialDateIso={dateIso}
                initialTime={time}
                onDateTimeChange={handleDateTimeChange}
                onSuccess={handleBooked}
              />
            )}
          </div>
        )}

        {mode === "intake" && (
          <IntakeForm
            trainerId={trainerId}
            initialDateIso={dateIso}
            initialTime={time}
            onDateTimeChange={handleDateTimeChange}
            onSuccess={onClose}
          />
        )}
      </div>
    </div>
  );
}

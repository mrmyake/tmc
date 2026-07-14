"use client";

import { useEffect, useState } from "react";
import { Container } from "@/components/layout/Container";
import { AdminField, AdminSelect } from "@/components/ui/AdminField";
import type { CustomerProfile } from "@/lib/admin/customer-core";
import {
  getPtCreditSummary,
  type PtCreditSummary,
} from "@/lib/admin/pt-credit-summary";
import { KlantPaneel } from "./KlantPaneel";
import { LosseSessieForm } from "./LosseSessieForm";
import { ProgrammaForm } from "./ProgrammaForm";
import { IntakeForm } from "./IntakeForm";

type Mode = "losse_sessie" | "programma" | "intake";

interface TrainerOption {
  id: string;
  displayName: string;
}

interface ProgramInfo {
  priceCents: number;
  displayName: string;
}

interface PtBookScreenProps {
  trainers: TrainerOption[];
  defaultTrainerId: string | null;
  studioProgram: ProgramInfo;
  onlineProgram: ProgramInfo;
  /** C3: betaallinks (tmc.admin_create_order) zijn admin-only. */
  paymentLinksEnabled: boolean;
}

// COPY: confirm met Marlon
const MODE_TABS: Array<{ id: Mode; label: string }> = [
  { id: "losse_sessie", label: "Losse sessie" },
  { id: "programma", label: "12-weken programma" },
  { id: "intake", label: "Intake" },
];

/**
 * PT-agenda C2/C3: Boek-voor-klant-scherm. Links de klant (of, in
 * intake-modus, de intake-toelichting); rechts de drie boek-vormen op de
 * RPC's uit C1. Toegang: admin of actieve trainer (tmc.is_staff() op de
 * RPC's, requireTrainerOrAdmin in de actions). Betaallinks blijven
 * admin-only via paymentLinksEnabled.
 */
export function PtBookScreen({
  trainers,
  defaultTrainerId,
  studioProgram,
  onlineProgram,
  paymentLinksEnabled,
}: PtBookScreenProps) {
  const [trainerId, setTrainerId] = useState(defaultTrainerId ?? "");
  const [mode, setMode] = useState<Mode>("losse_sessie");
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

  const needsCustomer = mode === "losse_sessie" || mode === "programma";

  return (
    <Container className="py-12 md:py-16 max-w-5xl">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          PT-agenda
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-[1.05] tracking-[-0.02em]">
          {/* COPY: confirm met Marlon */}
          Boek voor een klant.
        </h1>
      </header>

      <div className="mb-8 max-w-xs">
        <AdminField label="Trainer">
          <AdminSelect
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
          >
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
      </div>

      {!trainerId ? (
        <section className="bg-bg-elevated p-10 text-center">
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted text-base max-w-md mx-auto">
            Er zijn nog geen actieve trainers om op te boeken.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-8 items-start">
          <div>
            {mode === "intake" ? (
              <div className="bg-bg-elevated border border-[color:var(--ink-500)] p-6">
                <span className="tmc-eyebrow block mb-3">Intake</span>
                {/* COPY: confirm met Marlon */}
                <p className="text-text-muted text-sm mb-5">
                  Een intake is voor een nieuwe klant zonder account. Er is
                  geen klant om te kiezen; naam en e-mail vul je rechts in.
                </p>
                <button
                  type="button"
                  onClick={() => setMode("losse_sessie")}
                  className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted hover:text-accent transition-colors cursor-pointer"
                >
                  {/* COPY: confirm met Marlon */}
                  ← Toch een bestaande klant zoeken
                </button>
              </div>
            ) : (
              <KlantPaneel
                customer={customer}
                creditSummary={creditSummary}
                onSelect={setCustomer}
                onClear={() => setCustomer(null)}
                onSwitchToIntake={() => setMode("intake")}
              />
            )}
          </div>

          <div>
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

            {mode === "intake" ? (
              <IntakeForm trainerId={trainerId} />
            ) : needsCustomer && !customer ? (
              <div className="bg-bg-elevated p-8 text-center">
                {/* COPY: confirm met Marlon */}
                <p className="text-text-muted text-sm">
                  Kies eerst een klant links.
                </p>
              </div>
            ) : mode === "losse_sessie" && customer ? (
              <LosseSessieForm
                trainerId={trainerId}
                customer={customer}
                creditSummary={creditSummary}
                paymentLinksEnabled={paymentLinksEnabled}
              />
            ) : mode === "programma" && customer ? (
              <ProgrammaForm
                trainerId={trainerId}
                customer={customer}
                studioProgram={studioProgram}
                onlineProgram={onlineProgram}
                paymentLinksEnabled={paymentLinksEnabled}
              />
            ) : null}
          </div>
        </div>
      )}
    </Container>
  );
}

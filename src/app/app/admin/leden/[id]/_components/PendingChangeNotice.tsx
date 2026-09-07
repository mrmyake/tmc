"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import {
  cancelPlanChange,
  type MemberActionResult,
} from "@/lib/admin/member-actions";
import { formatEuro } from "@/lib/format";
import { formatShortDate } from "@/lib/format-date";
import type { MemberPendingChangeRow } from "@/lib/admin/member-detail-query";

interface PendingChangeNoticeProps {
  profileId: string;
  change: MemberPendingChangeRow;
}

/**
 * Advies per `failure_reason`, want "opnieuw indienen" klopt lang niet
 * altijd. De cron zet precies deze drie waarden
 * (`process_due_membership_change_requests`), en
 * `request_membership_change` weigert een nieuwe indiening zolang de
 * membership niet `active` is. Zelfde vorm als de reason-map in
 * `member-actions.ts`, met een terugval voor onbekende codes.
 */
const FAILURE_ADVICE: Record<string, string> = {
  // COPY: confirm met Marlon
  subscription_changed:
    "De incasso van dit lid was gewisseld toen de wijziging aan de beurt was. Opnieuw indienen werkt: het nieuwe verzoek pakt de actuele incasso.",
  // COPY: confirm met Marlon
  membership_not_active:
    "Het abonnement stond niet op actief toen de wijziging aan de beurt was. Opnieuw indienen wordt geweigerd. Zeg dit abonnement op en maak een nieuw abonnement aan op het gewenste plan.",
  // COPY: confirm met Marlon
  membership_missing:
    "Het abonnement bestaat niet meer. Opnieuw indienen kan niet; herstel het bedrag handmatig bij Mollie.",
};

// COPY: confirm met Marlon
const FAILURE_ADVICE_FALLBACK =
  "Zoek uit waarom de verwerking niet lukte voordat je de wijziging opnieuw indient.";

/**
 * Toont een nog niet verwerkte abonnementswijziging op de ledendetailpagina.
 *
 * Bestaansreden: bij het indienen gaat het Mollie-bedrag meteen omhoog,
 * terwijl de rechten pas op de factuurdatum wisselen. Zonder dit blok is die
 * tussenstand nergens zichtbaar en is een verkeerd ingediende upgrade alleen
 * via de database terug te draaien.
 *
 * Bedragen komen ongewijzigd uit de snapshot op de verzoekrij; zie de
 * toelichting bij `MemberPendingChangeRow`. Hier wordt niets herrekend.
 */
export function PendingChangeNotice({
  profileId,
  change,
}: PendingChangeNoticeProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const isFailed = change.status === "failed";
  const billingCycleWeeks = change.billingCycleWeeks;

  const toneClass = isFailed
    ? "border-[color:var(--danger)]/40 border-l-4 border-l-[color:var(--danger)]"
    : "border-[color:var(--warning)]/40 border-l-4 border-l-[color:var(--warning)]";
  const eyebrowClass = isFailed
    ? "text-[color:var(--danger)]"
    : "text-[color:var(--warning)]";

  return (
    <>
      <aside role="note" className={`p-5 border bg-bg-elevated ${toneClass}`}>
        <span className={`tmc-eyebrow block mb-3 ${eyebrowClass}`}>
          {/* COPY: confirm met Marlon */}
          {isFailed
            ? "Abonnementswijziging mislukt"
            : "Abonnementswijziging gepland"}
        </span>

        <div className="flex flex-wrap items-center gap-2 text-text text-sm mb-3">
          <span>{change.currentPlanName}</span>
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
          <span className="text-accent">{change.targetPlanName}</span>
          {change.targetExtendedAccess && (
            <span className="text-text-muted">
              {/* COPY: confirm met Marlon */}
              incl. verlengde toegang
            </span>
          )}
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
          <div className="flex justify-between gap-4">
            {/* COPY: confirm met Marlon */}
            <dt className="text-text-muted">Huidig bedrag</dt>
            <dd className="text-text tabular-nums">
              {formatEuro(Math.round(change.currentRecurringCents / 100))} per{" "}
              {billingCycleWeeks} weken
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            {/* COPY: confirm met Marlon */}
            <dt className="text-text-muted">Nieuw bedrag</dt>
            <dd className="text-text tabular-nums">
              {formatEuro(Math.round(change.newRecurringCents / 100))} per{" "}
              {billingCycleWeeks} weken
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            {/* COPY: confirm met Marlon */}
            <dt className="text-text-muted">
              {isFailed ? "Zou ingaan op" : "Gaat in op"}
            </dt>
            <dd className="text-text">
              {formatShortDate(new Date(change.effectiveDate))}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            {/* COPY: confirm met Marlon */}
            <dt className="text-text-muted">Aangevraagd door</dt>
            <dd className="text-text">
              {change.requestedVia === "admin" ? "Studio" : "Lid zelf"}
            </dd>
          </div>
        </dl>

        {isFailed ? (
          <div className="flex flex-col gap-3 text-sm leading-relaxed">
            <p className="text-text-muted">
              {/* COPY: confirm met Marlon */}
              De verwerking is niet gelukt, dus de rechten van dit lid zijn
              niet gewisseld.
            </p>
            <p className="text-text-muted">
              {change.failureReason
                ? (FAILURE_ADVICE[change.failureReason] ??
                  FAILURE_ADVICE_FALLBACK)
                : FAILURE_ADVICE_FALLBACK}
            </p>
            <p className="text-text-muted">
              {/* COPY: confirm met Marlon */}
              Let op: het incassobedrag bij Mollie is bij het indienen al
              verhoogd naar het nieuwe tarief en blijft verhoogd, totdat een
              geslaagde herindiening de wijziging alsnog toepast of iemand het
              bedrag handmatig terugzet. Tot die tijd betaalt dit lid meer dan
              het krijgt.
            </p>
          </div>
        ) : (
          <p className="text-text-muted text-sm leading-relaxed">
            {/* COPY: confirm met Marlon */}
            Het incassobedrag bij Mollie is al aangepast naar het nieuwe
            tarief; de rechten wisselen op de ingangsdatum hierboven.
            Annuleren zet het bedrag terug naar het huidige tarief.
          </p>
        )}

        {!isFailed && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="mt-4 inline-flex items-center justify-center px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text hover:border-accent hover:text-accent transition-colors cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            Wijziging annuleren
          </button>
        )}
      </aside>

      {!isFailed && (
        <CancelChangeDialog
          open={dialogOpen}
          profileId={profileId}
          change={change}
          billingCycleWeeks={billingCycleWeeks}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

function CancelChangeDialog({
  open,
  profileId,
  change,
  billingCycleWeeks,
  onClose,
}: {
  open: boolean;
  profileId: string;
  change: MemberPendingChangeRow;
  billingCycleWeeks: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MemberActionResult | null>(null);

  function submit() {
    setResult(null);
    startTransition(async () => {
      const res = await cancelPlanChange({
        profileId,
        requestId: change.id,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onClose, 900);
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Wijziging annuleren">
      <p className="text-text-muted text-sm mb-6">
        {/* COPY: confirm met Marlon */}
        De geplande overstap naar {change.targetPlanName} vervalt en het
        incassobedrag bij Mollie gaat terug naar{" "}
        {formatEuro(Math.round(change.currentRecurringCents / 100))} per{" "}
        {billingCycleWeeks} weken. Het abonnement zelf blijft ongewijzigd
        doorlopen.
      </p>
      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        confirmLabel={pending ? "Bezig" : "Wijziging annuleren"}
        confirmDisabled={pending}
      />
    </Dialog>
  );
}

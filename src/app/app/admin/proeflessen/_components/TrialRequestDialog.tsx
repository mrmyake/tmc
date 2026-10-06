"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import type { TrialRequestRow } from "@/lib/admin/trial-requests-query";
import {
  updateTrialRequestNotes,
  updateTrialRequestStatus,
} from "@/lib/admin/trial-requests-actions";
import {
  TRIAL_REQUEST_NOTES_MAX,
  TRIAL_REQUEST_STATUSES,
  TRIAL_REQUEST_STATUS_LABEL,
  experienceLabel,
  type TrialRequestStatus,
} from "@/lib/trial-requests/status";
import { formatShortDateWithYear, formatTime } from "@/lib/format-date";
import { WhatsAppButton } from "./WhatsAppButton";

const fieldClasses =
  "w-full bg-bg-elevated border border-[color:var(--ink-500)] px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="tmc-eyebrow">{label}</span>
      <div className="text-sm text-text">{children}</div>
    </div>
  );
}

/**
 * Detail per aanvraag in een Dialog (zelfde patroon als RevokeCodeButton):
 * contactgegevens, bericht, en de twee bewerkbare velden status en
 * notitie. Een klik op Opslaan stuurt alleen wat gewijzigd is.
 */
export function TrialRequestDialog({ row }: { row: TrialRequestRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<TrialRequestStatus>(row.status);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const statusChanged = status !== row.status;
  const notesChanged = notes.trim() !== (row.notes ?? "");
  const dirty = statusChanged || notesChanged;

  function openDialog() {
    setStatus(row.status);
    setNotes(row.notes ?? "");
    setResult(null);
    setOpen(true);
  }

  function save() {
    startTransition(async () => {
      const messages: string[] = [];
      let ok = true;
      if (statusChanged) {
        const res = await updateTrialRequestStatus(row.id, status);
        ok = ok && res.ok;
        messages.push(res.message);
      }
      if (notesChanged) {
        const res = await updateTrialRequestNotes(row.id, notes);
        ok = ok && res.ok;
        messages.push(res.message);
      }
      setResult({ ok, message: messages.join(" ") });
      if (ok) router.refresh();
    });
  }

  const created = new Date(row.createdAt);
  const experience = experienceLabel(row.experience);

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted hover:text-accent transition-colors cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        Details
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={row.name}
        // COPY: confirm met Marlon
        eyebrow="Proefles-aanvraag"
      >
        {/* text-left: de dialoog erft text-align van de rechts uitgelijnde actiekolom. */}
        <div className="flex flex-col gap-5 text-left">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* COPY: confirm met Marlon */}
            <DetailRow label="Aangevraagd">
              {formatShortDateWithYear(created)} om {formatTime(created)}
            </DetailRow>
            {/* COPY: confirm met Marlon */}
            <DetailRow label="E-mail">
              <a href={`mailto:${row.email}`} className="hover:text-accent transition-colors break-all">
                {row.email}
              </a>
            </DetailRow>
            {/* COPY: confirm met Marlon */}
            <DetailRow label="Telefoon">
              {row.phone ? (
                <div className="flex flex-wrap items-center gap-3">
                  <a href={`tel:${row.phone}`} className="hover:text-accent transition-colors">
                    {row.phone}
                  </a>
                  <WhatsAppButton href={row.whatsappHref} name={row.name} />
                </div>
              ) : (
                <span className="text-text-muted">Niet opgegeven</span>
              )}
            </DetailRow>
            {/* COPY: confirm met Marlon */}
            <DetailRow label="Ervaring">
              {experience ?? <span className="text-text-muted">Niet opgegeven</span>}
            </DetailRow>
            {/* COPY: confirm met Marlon */}
            <DetailRow label="Voorkeur dag of tijd">
              {row.preference ?? <span className="text-text-muted">Geen voorkeur</span>}
            </DetailRow>
          </div>

          {/* COPY: confirm met Marlon */}
          <DetailRow label="Bericht">
            {row.message ? (
              <p className="whitespace-pre-wrap text-text-muted">{row.message}</p>
            ) : (
              <span className="text-text-muted">Geen bericht</span>
            )}
          </DetailRow>

          <label className="flex flex-col gap-1">
            {/* COPY: confirm met Marlon */}
            <span className="tmc-eyebrow">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TrialRequestStatus)}
              disabled={pending}
              className={`${fieldClasses} cursor-pointer`}
            >
              {TRIAL_REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TRIAL_REQUEST_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            {/* COPY: confirm met Marlon */}
            <span className="tmc-eyebrow">Notitie (intern)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={TRIAL_REQUEST_NOTES_MAX}
              disabled={pending}
              // COPY: confirm met Marlon
              placeholder="Bijvoorbeeld: gebeld op dinsdag, wil graag de yoga-les proberen."
              className={`${fieldClasses} resize-none`}
            />
            <span className="text-xs text-text-muted text-right">
              {notes.length} / {TRIAL_REQUEST_NOTES_MAX}
            </span>
          </label>
        </div>

        <DialogFooter
          result={result}
          onClose={() => setOpen(false)}
          onConfirm={save}
          // COPY: confirm met Marlon
          cancelLabel="Sluiten"
          confirmLabel={pending ? "Bezig" : "Opslaan"}
          confirmDisabled={pending || !dirty}
        />
      </Dialog>
    </>
  );
}

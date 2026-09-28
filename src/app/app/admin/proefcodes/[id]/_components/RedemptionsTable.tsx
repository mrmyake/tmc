"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Chip } from "@/components/ui/Chip";
import { adminCancelTrialBooking } from "@/lib/admin/trial-codes-actions";
import type { TrialCodeRedemptionRow } from "@/lib/admin/trial-codes-query";
import { formatShortDateWithYear, formatTime } from "@/lib/format-date";

function isoWeekYear(date: Date): { isoWeek: number; isoYear: number } {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { isoWeek, isoYear: target.getUTCFullYear() };
}

function roosterWeekHref(startAtIso: string): string {
  const { isoWeek, isoYear } = isoWeekYear(new Date(startAtIso));
  return `/app/admin/rooster?week=${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

// COPY: confirm met Marlon
const BOOKING_STATUS_LABEL: Record<string, string> = {
  paid: "Bevestigd",
  attended: "Aanwezig",
  no_show: "Niet gekomen",
  cancelled: "Geannuleerd",
  pending: "In behandeling",
};

function SessionCell({ row }: { row: TrialCodeRedemptionRow }) {
  if (!row.sessionStartAt) {
    // COPY: confirm met Marlon
    return <span className="text-text-muted text-sm">Onbekend</span>;
  }
  const start = new Date(row.sessionStartAt);
  return (
    <Link
      href={roosterWeekHref(row.sessionStartAt)}
      className="flex flex-col hover:text-accent transition-colors group/session"
    >
      <span className="text-sm text-text group-hover/session:text-accent transition-colors">
        {row.className ?? "Sessie"}
      </span>
      <span className="text-xs text-text-muted">
        {formatShortDateWithYear(start)} · {formatTime(start)}
      </span>
    </Link>
  );
}

function EmailCell({ row }: { row: TrialCodeRedemptionRow }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text-muted">{row.email}</span>
      {row.emailFreeCount > 1 && (
        <Chip
          tone="warning"
          // COPY: confirm met Marlon
          title={`${row.emailFreeCount} gratis proeflessen met dit e-mailadres`}
        >
          <AlertTriangle size={10} strokeWidth={1.5} aria-hidden />
          {/* COPY: confirm met Marlon */}
          {row.emailFreeCount}x gratis
        </Chip>
      )}
    </div>
  );
}

function StatusCell({ row }: { row: TrialCodeRedemptionRow }) {
  const cancelled = row.releasedAt !== null || row.bookingStatus === "cancelled";
  return (
    <Chip tone={cancelled ? "muted" : row.bookingStatus === "paid" ? "success" : "accent"}>
      {cancelled
        ? // COPY: confirm met Marlon
          "Geannuleerd"
        : (BOOKING_STATUS_LABEL[row.bookingStatus] ?? row.bookingStatus)}
    </Chip>
  );
}

function CancelBookingButton({
  row,
  codeId,
}: {
  row: TrialCodeRedemptionRow;
  codeId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function confirm() {
    startTransition(async () => {
      const res = await adminCancelTrialBooking({
        trialBookingId: row.trialBookingId,
        codeId,
      });
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 border border-[color:var(--danger)]/40 text-[color:var(--danger)] text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-2 hover:bg-[color:var(--danger)]/10 transition-colors cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        Annuleren
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        // COPY: confirm met Marlon
        title="Boeking annuleren?"
        eyebrow="Proefcodes"
        tone="danger"
        size="narrow"
      >
        <p className="text-text-muted text-sm mb-3">
          {/* COPY: confirm met Marlon */}
          De proefles van {row.name} ({row.className ?? "sessie"}) wordt
          geannuleerd en de plek komt vrij. Het gebruik gaat terug naar de
          code. De bezoeker krijgt hiervan geen automatische mail.
        </p>
        <DialogFooter
          result={result}
          onClose={() => setOpen(false)}
          onConfirm={confirm}
          // COPY: confirm met Marlon
          cancelLabel="Terug"
          confirmLabel={pending ? "Bezig" : "Annuleren"}
          confirmDisabled={pending || result?.ok === true}
          confirmTone="danger"
        />
      </Dialog>
    </>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center border-t border-[color:var(--ink-500)]/60">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        {/* COPY: confirm met Marlon */}
        Nog niet gebruikt
      </span>
      <p className="text-text-muted text-sm max-w-md mx-auto">
        {/* COPY: confirm met Marlon */}
        Deze code is nog niet ingewisseld.
      </p>
    </div>
  );
}

export function RedemptionsTable({
  rows,
  codeId,
}: {
  rows: TrialCodeRedemptionRow[];
  codeId: string;
}) {
  if (rows.length === 0) return <EmptyState />;

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                <span className="tmc-eyebrow">Naam</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">E-mail</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Telefoon</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Les</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Ingewisseld</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Status</span>
              </th>
              <th scope="col" className="py-3 pl-4 pr-3 text-right">
                <span className="tmc-eyebrow">Actie</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 hover:bg-bg-elevated/60 ${
                  row.releasedAt ? "opacity-70" : ""
                }`}
              >
                <td className="py-4 pl-3 pr-4 align-middle text-sm text-text">{row.name}</td>
                <td className="py-4 px-4 align-middle">
                  <EmailCell row={row} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">{row.phone}</td>
                <td className="py-4 px-4 align-middle">
                  <SessionCell row={row} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {formatShortDateWithYear(new Date(row.redeemedAt))}
                </td>
                <td className="py-4 px-4 align-middle">
                  <StatusCell row={row} />
                </td>
                <td className="py-4 pl-4 pr-3 align-middle text-right">
                  {row.canCancel && <CancelBookingButton row={row} codeId={codeId} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden flex flex-col border-t border-[color:var(--ink-500)]/60">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`flex flex-col gap-3 py-4 border-b border-[color:var(--ink-500)]/40 ${
              row.releasedAt ? "opacity-70" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm text-text">{row.name}</span>
              <StatusCell row={row} />
            </div>
            <EmailCell row={row} />
            <div className="text-xs text-text-muted">{row.phone}</div>
            <SessionCell row={row} />
            <div className="text-xs text-text-muted">
              {/* COPY: confirm met Marlon */}
              Ingewisseld {formatShortDateWithYear(new Date(row.redeemedAt))}
            </div>
            {row.canCancel && (
              <div>
                <CancelBookingButton row={row} codeId={codeId} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

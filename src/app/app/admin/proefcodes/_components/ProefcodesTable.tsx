"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import { revokeTrialCode } from "@/lib/admin/trial-codes-actions";
import type {
  TrialCodeRow,
  TrialCodeStatusFilter,
} from "@/lib/admin/trial-codes-query";
import { formatShortDateWithYear, formatTime } from "@/lib/format-date";

// COPY: confirm met Marlon
const PILLAR_LABEL: Record<string, string> = {
  yoga_mobility: "Yoga & mobility",
  kettlebell: "Kettlebell",
};

function pillarLabel(pillar: string | null): string {
  // COPY: confirm met Marlon
  return pillar ? (PILLAR_LABEL[pillar] ?? pillar) : "Beide";
}

// COPY: confirm met Marlon
const STATUS_CHIP: Record<
  TrialCodeRow["status"],
  { label: string; tone: ChipTone }
> = {
  active: { label: "Actief", tone: "accent" },
  redeemed: { label: "Verzilverd", tone: "success" },
  revoked: { label: "Ingetrokken", tone: "muted" },
};

function isoWeekYear(date: Date): { isoWeek: number; isoYear: number } {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { isoWeek, isoYear: target.getUTCFullYear() };
}

function roosterWeekHref(startAtIso: string): string {
  const { isoWeek, isoYear } = isoWeekYear(new Date(startAtIso));
  return `/app/admin/rooster?week=${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

function daysRemaining(expiresAtIso: string): number {
  return Math.ceil(
    (new Date(expiresAtIso).getTime() - Date.now()) / 86_400_000,
  );
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord-toegang kan geweigerd zijn; de code staat leesbaar in de rij.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      // COPY: confirm met Marlon
      title="Kopieer code"
      className="inline-flex items-center gap-1.5 font-mono text-sm text-text hover:text-accent transition-colors cursor-pointer"
    >
      <Copy size={12} strokeWidth={1.5} aria-hidden />
      {/* COPY: confirm met Marlon */}
      {copied ? "Gekopieerd" : code}
    </button>
  );
}

function RevokeCodeButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  function confirm() {
    startTransition(async () => {
      const res = await revokeTrialCode(id);
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
        Intrekken
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        // COPY: confirm met Marlon
        title="Code intrekken?"
        eyebrow="Proefcodes"
        tone="danger"
        size="narrow"
      >
        <p className="text-text-muted text-sm mb-3">
          {/* COPY: confirm met Marlon */}
          Code {code} kan daarna niet meer verzilverd worden.
        </p>
        <DialogFooter
          result={result}
          onClose={() => setOpen(false)}
          onConfirm={confirm}
          // COPY: confirm met Marlon
          cancelLabel="Terug"
          confirmLabel={pending ? "Bezig" : "Intrekken"}
          confirmDisabled={pending}
          confirmTone="danger"
        />
      </Dialog>
    </>
  );
}

function ExpiryCell({ row }: { row: TrialCodeRow }) {
  const days = daysRemaining(row.expiresAt);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-text">
        {formatShortDateWithYear(new Date(row.expiresAt))}
      </span>
      {row.isExpired ? (
        // COPY: confirm met Marlon
        <Chip tone="muted">Verlopen</Chip>
      ) : (
        <span
          className={`text-xs ${
            days < 5 ? "text-text-muted/70" : "text-text-muted"
          }`}
        >
          {/* COPY: confirm met Marlon */}
          nog {days} {days === 1 ? "dag" : "dagen"}
        </span>
      )}
    </div>
  );
}

function CodeWithReleaseBadge({ row }: { row: TrialCodeRow }) {
  return (
    <div className="flex flex-col gap-1.5">
      <CopyCodeButton code={row.code} />
      {row.releasedAt && (
        <Chip
          tone="accent"
          // COPY: confirm met Marlon
          title={`Vrijgegeven op ${formatShortDateWithYear(new Date(row.releasedAt))}`}
        >
          {/* COPY: confirm met Marlon */}
          Opnieuw vrijgegeven
        </Chip>
      )}
    </div>
  );
}

function SessionCell({ row }: { row: TrialCodeRow }) {
  const redeemer = row.redeemer;
  if (!redeemer?.sessionStartAt) {
    // COPY: confirm met Marlon
    return <span className="text-text-muted text-sm">Onbekend</span>;
  }
  const start = new Date(redeemer.sessionStartAt);
  return (
    <Link
      href={roosterWeekHref(redeemer.sessionStartAt)}
      className="flex flex-col hover:text-accent transition-colors group/session"
    >
      <span className="text-sm text-text group-hover/session:text-accent transition-colors">
        {redeemer.className ?? "Sessie"}
      </span>
      <span className="text-xs text-text-muted">
        {formatShortDateWithYear(start)} · {formatTime(start)}
      </span>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        {/* COPY: confirm met Marlon */}
        Geen proefcodes
      </span>
      <p className="text-text-muted text-sm max-w-md mx-auto">
        {/* COPY: confirm met Marlon */}
        Geen proefcodes gevonden bij deze filter.
      </p>
    </div>
  );
}

function ActiveTable({ rows }: { rows: TrialCodeRow[] }) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                <span className="tmc-eyebrow">Code</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Pillar</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Batch</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Aangemaakt</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Vervalt</span>
              </th>
              {/* COPY: confirm met Marlon */}
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
                  row.isExpired ? "opacity-60" : ""
                }`}
              >
                <td className="py-4 pl-3 pr-4 align-middle">
                  <CodeWithReleaseBadge row={row} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text">
                  {pillarLabel(row.pillar)}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {row.batchLabel ?? "—"}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {formatShortDateWithYear(new Date(row.createdAt))}
                </td>
                <td className="py-4 px-4 align-middle">
                  <ExpiryCell row={row} />
                </td>
                <td className="py-4 pl-4 pr-3 align-middle text-right">
                  <RevokeCodeButton id={row.id} code={row.code} />
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
              row.isExpired ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <CodeWithReleaseBadge row={row} />
              <ExpiryCell row={row} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="text-text">{pillarLabel(row.pillar)}</span>
              <span>·</span>
              <span>{row.batchLabel ?? "—"}</span>
              <span>·</span>
              <span>
                {/* COPY: confirm met Marlon */}
                Aangemaakt {formatShortDateWithYear(new Date(row.createdAt))}
              </span>
            </div>
            <div>
              <RevokeCodeButton id={row.id} code={row.code} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function RedeemedTable({ rows }: { rows: TrialCodeRow[] }) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                <span className="tmc-eyebrow">Code</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Naam</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">E-mail</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Telefoon</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Geboekte les</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-4 pr-3 text-left">
                <span className="tmc-eyebrow">Verzilverd op</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 hover:bg-bg-elevated/60"
              >
                <td className="py-4 pl-3 pr-4 align-middle">
                  <CopyCodeButton code={row.code} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text">
                  {row.redeemer?.name ?? "—"}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {row.redeemer?.email ?? "—"}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {row.redeemer?.phone ?? "—"}
                </td>
                <td className="py-4 px-4 align-middle">
                  <SessionCell row={row} />
                </td>
                <td className="py-4 pl-4 pr-3 align-middle text-sm text-text-muted">
                  {row.redeemedAt
                    ? formatShortDateWithYear(new Date(row.redeemedAt))
                    : "—"}
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
            className="flex flex-col gap-3 py-4 border-b border-[color:var(--ink-500)]/40"
          >
            <div className="flex items-start justify-between gap-3">
              <CopyCodeButton code={row.code} />
              <span className="text-xs text-text-muted">
                {row.redeemedAt
                  ? formatShortDateWithYear(new Date(row.redeemedAt))
                  : "—"}
              </span>
            </div>
            <div className="text-sm text-text">{row.redeemer?.name ?? "—"}</div>
            <div className="text-xs text-text-muted">
              {row.redeemer?.email ?? "—"} · {row.redeemer?.phone ?? "—"}
            </div>
            <SessionCell row={row} />
          </li>
        ))}
      </ul>
    </>
  );
}

function RevokedTable({ rows }: { rows: TrialCodeRow[] }) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                <span className="tmc-eyebrow">Code</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Batch</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Aangemaakt</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-4 pr-3 text-left">
                <span className="tmc-eyebrow">Ingetrokken op</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 hover:bg-bg-elevated/60 opacity-70"
              >
                <td className="py-4 pl-3 pr-4 align-middle font-mono text-sm text-text">
                  {row.code}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {row.batchLabel ?? "—"}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {formatShortDateWithYear(new Date(row.createdAt))}
                </td>
                <td className="py-4 pl-4 pr-3 align-middle text-sm text-text-muted">
                  {row.revokedAt
                    ? formatShortDateWithYear(new Date(row.revokedAt))
                    : "—"}
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
            className="flex flex-col gap-2 py-4 border-b border-[color:var(--ink-500)]/40 opacity-70"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-text">{row.code}</span>
              <span className="text-xs text-text-muted">
                {row.revokedAt
                  ? formatShortDateWithYear(new Date(row.revokedAt))
                  : "—"}
              </span>
            </div>
            <div className="text-xs text-text-muted">
              {row.batchLabel ?? "—"} ·{" "}
              {/* COPY: confirm met Marlon */}
              Aangemaakt {formatShortDateWithYear(new Date(row.createdAt))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function AllDetailsCell({ row }: { row: TrialCodeRow }) {
  if (row.status === "active") {
    return <ExpiryCell row={row} />;
  }
  if (row.status === "redeemed") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm text-text">{row.redeemer?.name ?? "—"}</span>
        <span className="text-xs text-text-muted">
          {/* COPY: confirm met Marlon */}
          Verzilverd{" "}
          {row.redeemedAt
            ? formatShortDateWithYear(new Date(row.redeemedAt))
            : ""}
        </span>
      </div>
    );
  }
  return (
    <span className="text-xs text-text-muted">
      {/* COPY: confirm met Marlon */}
      Ingetrokken{" "}
      {row.revokedAt ? formatShortDateWithYear(new Date(row.revokedAt)) : ""}
    </span>
  );
}

function AllTable({ rows }: { rows: TrialCodeRow[] }) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                <span className="tmc-eyebrow">Code</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Status</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Pillar</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Batch</span>
              </th>
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Details</span>
              </th>
              {/* COPY: confirm met Marlon */}
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
                  row.isExpired ? "opacity-60" : ""
                }`}
              >
                <td className="py-4 pl-3 pr-4 align-middle">
                  <CodeWithReleaseBadge row={row} />
                </td>
                <td className="py-4 px-4 align-middle">
                  <Chip tone={STATUS_CHIP[row.status].tone}>
                    {STATUS_CHIP[row.status].label}
                  </Chip>
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text">
                  {pillarLabel(row.pillar)}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {row.batchLabel ?? "—"}
                </td>
                <td className="py-4 px-4 align-middle">
                  <AllDetailsCell row={row} />
                </td>
                <td className="py-4 pl-4 pr-3 align-middle text-right">
                  {row.status === "active" && (
                    <RevokeCodeButton id={row.id} code={row.code} />
                  )}
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
              row.isExpired ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <CodeWithReleaseBadge row={row} />
              <Chip tone={STATUS_CHIP[row.status].tone}>
                {STATUS_CHIP[row.status].label}
              </Chip>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="text-text">{pillarLabel(row.pillar)}</span>
              <span>·</span>
              <span>{row.batchLabel ?? "—"}</span>
            </div>
            <AllDetailsCell row={row} />
            {row.status === "active" && (
              <div>
                <RevokeCodeButton id={row.id} code={row.code} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

interface ProefcodesTableProps {
  rows: TrialCodeRow[];
  status: TrialCodeStatusFilter;
}

export function ProefcodesTable({ rows, status }: ProefcodesTableProps) {
  if (rows.length === 0) return <EmptyState />;

  if (status === "redeemed") return <RedeemedTable rows={rows} />;
  if (status === "revoked") return <RevokedTable rows={rows} />;
  if (status === "all") return <AllTable rows={rows} />;
  return <ActiveTable rows={rows} />;
}

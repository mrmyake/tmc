"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Pause,
  PlusCircle,
  Repeat,
  Trash2,
} from "lucide-react";
import {
  grantPause,
  addCredits,
  deleteMember,
  type MemberActionResult,
} from "@/lib/admin/member-actions";
import type { MemberDetailMembership } from "@/lib/admin/member-detail-query";

interface ActionMenuProps {
  profileId: string;
  firstName: string;
  primaryMembership: MemberDetailMembership | null;
}

type ActiveDialog = null | "pause" | "credits" | "switch" | "delete";

export function ActionMenu({
  profileId,
  firstName,
  primaryMembership,
}: ActionMenuProps) {
  const [active, setActive] = useState<ActiveDialog>(null);
  const hasActiveMembership = Boolean(primaryMembership);

  return (
    <>
      <div
        role="toolbar"
        aria-label="Lid-acties"
        className="flex flex-wrap gap-2"
      >
        <ActionButton
          icon={<Pause size={14} strokeWidth={1.5} />}
          label="Pauze toekennen"
          onClick={() => setActive("pause")}
          disabled={!hasActiveMembership}
        />
        <ActionButton
          icon={<PlusCircle size={14} strokeWidth={1.5} />}
          label="Credits aanpassen"
          onClick={() => setActive("credits")}
          disabled={!hasActiveMembership}
        />
        <ActionButton
          icon={<Repeat size={14} strokeWidth={1.5} />}
          label="Abonnement wijzigen"
          onClick={() => setActive("switch")}
          disabled
          title="Plan-switch flow komt in een latere release"
          // COPY: confirm with Marlon — interim "stop + opnieuw aanmelden" of wachten?
        />
        <ActionButton
          icon={<Trash2 size={14} strokeWidth={1.5} />}
          label="Account verwijderen"
          onClick={() => setActive("delete")}
          tone="danger"
        />
      </div>

      {active === "pause" && primaryMembership && (
        <GrantPauseDialog
          profileId={profileId}
          membership={primaryMembership}
          onClose={() => setActive(null)}
        />
      )}
      {active === "credits" && primaryMembership && (
        <AddCreditsDialog
          profileId={profileId}
          membership={primaryMembership}
          onClose={() => setActive(null)}
        />
      )}
      {active === "delete" && (
        <DeleteMemberDialog
          profileId={profileId}
          firstName={firstName}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  tone,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
  title?: string;
}) {
  const base =
    "inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors duration-300 cursor-pointer";
  const toneClass =
    tone === "danger"
      ? "border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
      : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${toneClass} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {icon}
      {label}
    </button>
  );
}

// ----------------------------------------------------------------------------
// Dialogs
// ----------------------------------------------------------------------------

function useDialog<T extends HTMLDialogElement>(open: boolean) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (open && ref.current) ref.current.showModal();
  }, [open]);
  return ref;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function todayPlusIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function GrantPauseDialog({
  profileId,
  membership,
  onClose,
}: {
  profileId: string;
  membership: MemberDetailMembership;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useDialog<HTMLDialogElement>(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MemberActionResult | null>(null);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayPlusIso(28));
  const [reason, setReason] = useState<string>("medical");

  function submit() {
    startTransition(async () => {
      const res = await grantPause({
        profileId,
        membershipId: membership.id,
        startDate,
        endDate,
        reason,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(close, 900);
      }
    });
  }

  function close() {
    ref.current?.close();
    onClose();
  }

  return (
    <DialogShell ref={ref} onClose={close} title="Pauze toekennen">
      <div className="grid grid-cols-2 gap-4 mb-5">
        <LabeledInput
          label="Start"
          type="date"
          value={startDate}
          onChange={setStartDate}
        />
        <LabeledInput
          label="Einde"
          type="date"
          value={endDate}
          onChange={setEndDate}
        />
      </div>
      <label className="flex flex-col gap-2 mb-6">
        <span className="tmc-eyebrow">Reden</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="medical">Medisch</option>
          <option value="pregnancy">Zwangerschap</option>
          <option value="other_approved">Anders (goedgekeurd)</option>
        </select>
      </label>
      <DialogFooter
        result={result}
        onClose={close}
        onConfirm={submit}
        confirmLabel={pending ? "Bezig" : "Pauze toekennen"}
        confirmDisabled={pending}
      />
    </DialogShell>
  );
}

function AddCreditsDialog({
  profileId,
  membership,
  onClose,
}: {
  profileId: string;
  membership: MemberDetailMembership;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useDialog<HTMLDialogElement>(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MemberActionResult | null>(null);
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await addCredits({
        profileId,
        membershipId: membership.id,
        delta,
        reason,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(close, 900);
      }
    });
  }

  function close() {
    ref.current?.close();
    onClose();
  }

  return (
    <DialogShell ref={ref} onClose={close} title="Credits aanpassen">
      <p className="text-text-muted text-sm mb-5">
        Huidig saldo: {membership.creditsRemaining ?? 0} credits. Gebruik een
        negatief getal om af te trekken.
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-3 mb-5 items-end">
        <LabeledInput
          label="Aanpassing (delta)"
          type="number"
          value={String(delta)}
          min={-20}
          max={20}
          onChange={(v) => setDelta(Number(v) || 0)}
        />
        <div className="pb-[10px] text-xs text-text-muted tabular-nums">
          Nieuw: {Math.max(0, (membership.creditsRemaining ?? 0) + delta)}
        </div>
      </div>
      <label className="flex flex-col gap-2 mb-6">
        <span className="tmc-eyebrow">Reden</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Bv. compensatie sessie-annulering, kadobon, correctie"
          className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent resize-none"
        />
      </label>
      <DialogFooter
        result={result}
        onClose={close}
        onConfirm={submit}
        confirmLabel={pending ? "Bezig" : "Opslaan"}
        confirmDisabled={pending || !reason.trim() || delta === 0}
      />
    </DialogShell>
  );
}

function DeleteMemberDialog({
  profileId,
  firstName,
  onClose,
}: {
  profileId: string;
  firstName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useDialog<HTMLDialogElement>(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MemberActionResult | null>(null);
  const [typed, setTyped] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await deleteMember({
        profileId,
        typedFirstName: typed,
      });
      setResult(res);
      if (res.ok) {
        window.setTimeout(() => {
          router.push("/app/admin/leden");
        }, 800);
      }
    });
  }

  function close() {
    ref.current?.close();
    onClose();
  }

  return (
    <DialogShell ref={ref} onClose={close} title="Lid verwijderen" tone="danger">
      <p className="text-text text-sm mb-3">
        Weet je het zeker? Dit kan niet teruggedraaid worden.
      </p>
      <p className="text-text-muted text-sm mb-5">
        Alle bookings, betalingen en notes van dit lid worden verwijderd. Actieve
        abonnementen worden eerst gecancelled. Vergeet niet handmatig de Mollie-
        subscription te stoppen.
      </p>
      <label className="flex flex-col gap-2 mb-6">
        <span className="tmc-eyebrow">
          Typ de voornaam ({firstName}) om te bevestigen
        </span>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
        />
      </label>
      <DialogFooter
        result={result}
        onClose={close}
        onConfirm={submit}
        confirmLabel={pending ? "Verwijderen…" : "Definitief verwijderen"}
        confirmTone="danger"
        confirmDisabled={
          pending ||
          typed.trim().toLowerCase() !== firstName.trim().toLowerCase()
        }
      />
    </DialogShell>
  );
}

// ----------------------------------------------------------------------------
// Dialog primitives
// ----------------------------------------------------------------------------

function DialogShell({
  ref,
  onClose,
  title,
  tone,
  children,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  title: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="bg-bg border border-[color:var(--ink-500)] text-text p-8 w-[min(92vw,520px)] backdrop:bg-bg/55 backdrop:backdrop-blur-sm"
    >
      <h3
        className={`font-[family-name:var(--font-playfair)] text-2xl md:text-3xl tracking-[-0.01em] mb-5 ${
          tone === "danger" ? "text-[color:var(--danger)]" : "text-text"
        }`}
      >
        {title}
      </h3>
      {children}
    </dialog>
  );
}

function DialogFooter({
  result,
  onClose,
  onConfirm,
  confirmLabel,
  confirmDisabled,
  confirmTone,
}: {
  result: MemberActionResult | null;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled?: boolean;
  confirmTone?: "danger";
}) {
  return (
    <>
      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`text-sm p-4 border mb-5 ${
            result.ok
              ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
              : "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
          }`}
        >
          {result.message}
        </div>
      )}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className={`inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${
            confirmTone === "danger"
              ? "border-[color:var(--danger)]/60 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
              : "bg-accent text-bg border-accent hover:bg-accent-hover hover:border-accent-hover"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </>
  );
}

function LabeledInput({
  label,
  type,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  type: "date" | "number" | "text";
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="tmc-eyebrow">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
      />
    </label>
  );
}

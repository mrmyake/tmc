"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, PlusCircle, Repeat, Trash2 } from "lucide-react";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import {
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "@/components/ui/AdminField";
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
  const close = () => setActive(null);

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

      {primaryMembership && (
        <GrantPauseDialog
          open={active === "pause"}
          profileId={profileId}
          membership={primaryMembership}
          onClose={close}
        />
      )}
      {primaryMembership && (
        <AddCreditsDialog
          open={active === "credits"}
          profileId={profileId}
          membership={primaryMembership}
          onClose={close}
        />
      )}
      <DeleteMemberDialog
        open={active === "delete"}
        profileId={profileId}
        firstName={firstName}
        onClose={close}
      />
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
// Dialogs — each a thin wrapper around <Dialog> + <DialogFooter>.
// ----------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function todayPlusIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function GrantPauseDialog({
  open,
  profileId,
  membership,
  onClose,
}: {
  open: boolean;
  profileId: string;
  membership: MemberDetailMembership;
  onClose: () => void;
}) {
  const router = useRouter();
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
        window.setTimeout(onClose, 900);
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Pauze toekennen">
      <div className="grid grid-cols-2 gap-4 mb-5">
        <AdminField label="Start">
          <AdminInput
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </AdminField>
        <AdminField label="Einde">
          <AdminInput
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </AdminField>
      </div>
      <AdminField label="Reden" className="mb-6">
        <AdminSelect
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="medical">Medisch</option>
          <option value="pregnancy">Zwangerschap</option>
          <option value="other_approved">Anders (goedgekeurd)</option>
        </AdminSelect>
      </AdminField>
      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        confirmLabel={pending ? "Bezig" : "Pauze toekennen"}
        confirmDisabled={pending}
      />
    </Dialog>
  );
}

function AddCreditsDialog({
  open,
  profileId,
  membership,
  onClose,
}: {
  open: boolean;
  profileId: string;
  membership: MemberDetailMembership;
  onClose: () => void;
}) {
  const router = useRouter();
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
        window.setTimeout(onClose, 900);
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Credits aanpassen">
      <p className="text-text-muted text-sm mb-5">
        Huidig saldo: {membership.creditsRemaining ?? 0} credits. Gebruik een
        negatief getal om af te trekken.
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-3 mb-5 items-end">
        <AdminField label="Aanpassing (delta)">
          <AdminInput
            type="number"
            value={delta}
            min={-20}
            max={20}
            onChange={(e) => setDelta(Number(e.target.value) || 0)}
          />
        </AdminField>
        <div className="pb-[10px] text-xs text-text-muted tabular-nums">
          Nieuw: {Math.max(0, (membership.creditsRemaining ?? 0) + delta)}
        </div>
      </div>
      <AdminField label="Reden" className="mb-6">
        <AdminTextarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Bv. compensatie sessie-annulering, kadobon, correctie"
        />
      </AdminField>
      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        confirmLabel={pending ? "Bezig" : "Opslaan"}
        confirmDisabled={pending || !reason.trim() || delta === 0}
      />
    </Dialog>
  );
}

function DeleteMemberDialog({
  open,
  profileId,
  firstName,
  onClose,
}: {
  open: boolean;
  profileId: string;
  firstName: string;
  onClose: () => void;
}) {
  const router = useRouter();
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Lid verwijderen"
      tone="danger"
    >
      <p className="text-text text-sm mb-3">
        Weet je het zeker? Dit kan niet teruggedraaid worden.
      </p>
      <p className="text-text-muted text-sm mb-5">
        Alle bookings, betalingen en notes van dit lid worden verwijderd.
        Actieve abonnementen worden eerst gecancelled. Vergeet niet handmatig
        de Mollie-subscription te stoppen.
      </p>
      <AdminField
        label={`Typ de voornaam (${firstName}) om te bevestigen`}
        className="mb-6"
      >
        <AdminInput
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
      </AdminField>
      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        confirmLabel={pending ? "Verwijderen..." : "Definitief verwijderen"}
        confirmTone="danger"
        confirmDisabled={
          pending ||
          typed.trim().toLowerCase() !== firstName.trim().toLowerCase()
        }
      />
    </Dialog>
  );
}

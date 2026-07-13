"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Ban,
  Pause,
  Play,
  PlusCircle,
  Repeat,
  Trash2,
  Undo2,
} from "lucide-react";
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
  resumeMembership,
  cancelMembership,
  undoCancellation,
  requestPlanChange,
  listUpgradeOptions,
  type MemberActionResult,
  type UpgradeOption,
} from "@/lib/admin/member-actions";
import {
  correctCustomerEmail,
  type CorrectEmailResult,
} from "@/lib/admin/customer-actions";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import type { MemberDetailMembership } from "@/lib/admin/member-detail-query";

interface ActionMenuProps {
  profileId: string;
  firstName: string;
  email: string;
  primaryMembership: MemberDetailMembership | null;
}

type ActiveDialog =
  | null
  | "pause"
  | "resume"
  | "cancel"
  | "undo"
  | "credits"
  | "switch"
  | "email"
  | "delete";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Elke functie hier geeft ofwel een concrete reden terug (knop disabled met
// die reden als tooltip) ofwel undefined (knop bruikbaar). Gespiegeld aan de
// live RPC-guards (zie discovery-admin-klantbeheer.md §8) zodat het menu
// nooit een actie aanbiedt die de RPC toch zou weigeren.

function pauseDisabledReason(m: MemberDetailMembership | null): string | undefined {
  if (!m) return "Geen abonnement voor dit lid.";
  if (m.pauseEffectiveDate) return "Er staat al een pauze gepland of actief.";
  if ((m.billingCycleWeeks ?? 0) === 0)
    return "Dit product heeft geen doorlopende incasso.";
  if (m.status !== "active") return "Alleen voor een actief abonnement.";
  return undefined;
}

function resumeDisabledReason(m: MemberDetailMembership | null): string | undefined {
  if (!m) return "Geen abonnement voor dit lid.";
  if (!m.pauseEffectiveDate) return "Alleen voor een gepauzeerd abonnement.";
  if (m.status !== "active" && m.status !== "paused")
    return "Dit abonnement staat niet open voor hervatten.";
  return undefined;
}

function cancelDisabledReason(m: MemberDetailMembership | null): string | undefined {
  if (!m) return "Geen abonnement voor dit lid.";
  if ((m.billingCycleWeeks ?? 0) === 0)
    return "Dit product heeft geen doorlopende incasso.";
  if (
    !["active", "paused", "cancellation_requested", "payment_failed"].includes(
      m.status,
    )
  )
    return "Dit abonnement is al stopgezet.";
  return undefined;
}

function undoDisabledReason(m: MemberDetailMembership | null): string | undefined {
  if (!m) return "Geen abonnement voor dit lid.";
  if (m.status !== "cancellation_requested")
    return "Er staat geen opzegging gepland.";
  if (m.cancellationSource !== "member")
    return "Deze opzegging is door een admin gestart en is niet terug te draaien.";
  if (m.cancellationPriorStatus !== "active")
    return "Deze opzegging is niet veilig terug te draaien.";
  if (!m.cancellationEffectiveDate || m.cancellationEffectiveDate <= todayIso())
    return "De einddatum is al bereikt; terugdraaien kan niet meer.";
  return undefined;
}

function switchDisabledReason(m: MemberDetailMembership | null): string | undefined {
  if (!m) return "Geen abonnement voor dit lid.";
  if ((m.billingCycleWeeks ?? 0) === 0)
    return "Dit product heeft geen doorlopende incasso.";
  if (m.pauseEffectiveDate) return "Niet mogelijk tijdens een pauze.";
  if (m.status !== "active") return "Alleen voor een actief abonnement.";
  return undefined;
}

export function ActionMenu({
  profileId,
  firstName,
  email,
  primaryMembership,
}: ActionMenuProps) {
  const [active, setActive] = useState<ActiveDialog>(null);
  const close = () => setActive(null);

  const pauseReason = pauseDisabledReason(primaryMembership);
  const resumeReason = resumeDisabledReason(primaryMembership);
  const cancelReason = cancelDisabledReason(primaryMembership);
  const undoReason = undoDisabledReason(primaryMembership);
  const switchReason = switchDisabledReason(primaryMembership);
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
          disabled={!!pauseReason}
          title={pauseReason}
        />
        <ActionButton
          icon={<Play size={14} strokeWidth={1.5} />}
          label="Hervatten"
          onClick={() => setActive("resume")}
          disabled={!!resumeReason}
          title={resumeReason}
        />
        <ActionButton
          icon={<Ban size={14} strokeWidth={1.5} />}
          label="Opzeggen"
          onClick={() => setActive("cancel")}
          disabled={!!cancelReason}
          title={cancelReason}
        />
        <ActionButton
          icon={<Undo2 size={14} strokeWidth={1.5} />}
          label="Opzegging terugdraaien"
          onClick={() => setActive("undo")}
          disabled={!!undoReason}
          title={undoReason}
        />
        <ActionButton
          icon={<PlusCircle size={14} strokeWidth={1.5} />}
          label="Credits aanpassen"
          onClick={() => setActive("credits")}
          disabled={!hasActiveMembership}
          title={hasActiveMembership ? undefined : "Geen abonnement voor dit lid."}
        />
        <ActionButton
          icon={<Repeat size={14} strokeWidth={1.5} />}
          label="Abonnement wisselen"
          onClick={() => setActive("switch")}
          disabled={!!switchReason}
          title={switchReason}
        />
        <ActionButton
          icon={<AtSign size={14} strokeWidth={1.5} />}
          label="E-mailadres corrigeren"
          onClick={() => setActive("email")}
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
        <ResumeMembershipDialog
          open={active === "resume"}
          profileId={profileId}
          membership={primaryMembership}
          onClose={close}
        />
      )}
      {primaryMembership && (
        <CancelMembershipDialog
          open={active === "cancel"}
          profileId={profileId}
          membership={primaryMembership}
          onClose={close}
        />
      )}
      {primaryMembership && (
        <UndoCancellationDialog
          open={active === "undo"}
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
      {primaryMembership && (
        <SwitchPlanDialog
          key={active === "switch" ? "switch-open" : "switch-closed"}
          open={active === "switch"}
          profileId={profileId}
          membership={primaryMembership}
          onClose={close}
        />
      )}
      <EmailCorrectionDialog
        open={active === "email"}
        profileId={profileId}
        currentEmail={email}
        onClose={close}
      />
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

function ResumeMembershipDialog({
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

  function submit() {
    startTransition(async () => {
      const res = await resumeMembership({
        profileId,
        membershipId: membership.id,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onClose, 900);
      }
    });
  }

  const blocked = Boolean(membership.resumeBlockedReason);

  return (
    <Dialog open={open} onClose={onClose} title="Abonnement hervatten">
      <p className="text-text-muted text-sm mb-5">
        {/* COPY: confirm met Marlon */}
        De incasso start weer vanaf vandaag en het lid kan direct weer
        boeken. De einddatum van de verplichting schuift automatisch op met
        de duur van de pauze.
      </p>
      {blocked && (
        <p className="text-[color:var(--warning)] text-sm mb-5">
          {/* COPY: confirm met Marlon */}
          De eerdere machtiging (SEPA-mandaat) is ongeldig of ingetrokken.
          Hervatten kan pas nadat het lid opnieuw een eerste betaling heeft
          gedaan.
        </p>
      )}
      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        confirmLabel={pending ? "Bezig" : "Hervatten"}
        confirmDisabled={pending || blocked}
      />
    </Dialog>
  );
}

function CancelMembershipDialog({
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
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"standard" | "hard">("standard");
  const [ackHardStop, setAckHardStop] = useState(false);
  const isHard = mode === "hard";

  function submit() {
    startTransition(async () => {
      const res = await cancelMembership({
        profileId,
        membershipId: membership.id,
        reason,
        hardStop: isHard,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onClose, 900);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Abonnement opzeggen"
      tone={isHard ? "danger" : "neutral"}
    >
      <p className="text-text-muted text-sm mb-5">
        {/* COPY: confirm met Marlon */}
        Het abonnement loopt door tot het einde van de lopende, al betaalde
        cyclus. Daarna stopt de incasso en het lidmaatschap definitief.
        Boekingen vanaf die datum worden automatisch geannuleerd. Staat er al
        een opzegging gepland, dan kan dit &apos;m alleen vervroegen, niet
        uitstellen.
      </p>
      <AdminField label="Reden" className="mb-5">
        <AdminTextarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Bv. op verzoek van het lid, wanbetaling, geschil"
        />
      </AdminField>
      <AdminField label="Modus" className={isHard ? "mb-5" : "mb-6"}>
        <AdminSelect
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as "standard" | "hard");
            setAckHardStop(false);
          }}
        >
          {/* COPY: confirm met Marlon */}
          <option value="standard">Standaard: einde van de betaalde cyclus</option>
          {/* COPY: confirm met Marlon */}
          <option value="hard">Direct stopzetten (coulance/geschil)</option>
        </AdminSelect>
      </AdminField>
      {isHard && (
        <>
          <p className="text-[color:var(--danger)] text-sm mb-4">
            {/* COPY: confirm met Marlon */}
            Dit stopt het abonnement per vandaag. De lopende cyclus wordt
            niet afgemaakt en boekingen vanaf vandaag vervallen direct.
            Gebruik dit alleen bij coulance of een geschil, niet als
            standaardroute.
          </p>
          <label className="inline-flex items-start gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={ackHardStop}
              onChange={(e) => setAckHardStop(e.target.checked)}
              className="mt-0.5"
            />
            {/* COPY: confirm met Marlon */}
            <span className="text-sm text-text">
              Ik snap dat dit niet de standaardroute is en dat de cyclus niet
              wordt afgemaakt.
            </span>
          </label>
        </>
      )}
      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        confirmLabel={
          pending ? "Bezig" : isHard ? "Direct stopzetten" : "Opzeggen bevestigen"
        }
        confirmTone={isHard ? "danger" : "accent"}
        confirmDisabled={pending || !reason.trim() || (isHard && !ackHardStop)}
      />
    </Dialog>
  );
}

function UndoCancellationDialog({
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

  function submit() {
    startTransition(async () => {
      const res = await undoCancellation({
        profileId,
        membershipId: membership.id,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onClose, 900);
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Opzegging terugdraaien">
      <p className="text-text-muted text-sm mb-6">
        {/* COPY: confirm met Marlon */}
        Het abonnement gaat weer op actief en de incasso loopt gewoon door;
        er is nooit een betaling gestopt. Boekingen die door de opzegging al
        geannuleerd zijn, komen niet automatisch terug — check dat zelf met
        het lid.
      </p>
      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        confirmLabel={pending ? "Bezig" : "Terugdraaien"}
        confirmDisabled={pending}
      />
    </Dialog>
  );
}

function SwitchPlanDialog({
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
  const [options, setOptions] = useState<UpgradeOption[] | null>(null);
  const [targetSlug, setTargetSlug] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listUpgradeOptions(membership.id).then((opts) => {
      if (cancelled) return;
      setOptions(opts);
      if (opts.length > 0) setTargetSlug(opts[0].slug);
    });
    return () => {
      cancelled = true;
    };
  }, [open, membership.id]);

  function submit() {
    startTransition(async () => {
      const res = await requestPlanChange({
        profileId,
        membershipId: membership.id,
        targetSlug,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onClose, 900);
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Abonnement wisselen">
      <p className="text-text-muted text-sm mb-5">
        {/* COPY: confirm met Marlon */}
        Dit kan alleen naar een duurder abonnement. Het nieuwe tarief gaat in
        op de eerstvolgende factuurdatum, zonder verrekening over de lopende
        cyclus.
      </p>
      {options === null ? (
        <p className="text-text-muted text-sm mb-6">
          {/* COPY: confirm met Marlon */}
          Bezig met laden...
        </p>
      ) : options.length === 0 ? (
        <p className="text-text-muted text-sm mb-6">
          {/* COPY: confirm met Marlon */}
          Geen duurder abonnement beschikbaar voor dit lid.
        </p>
      ) : (
        <AdminField label="Nieuw abonnement" className="mb-6">
          <AdminSelect
            value={targetSlug}
            onChange={(e) => setTargetSlug(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.displayName} — {formatEuro(Math.round(o.priceCents / 100))} /{" "}
                {o.billingCycleWeeks} wk
              </option>
            ))}
          </AdminSelect>
        </AdminField>
      )}
      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        confirmLabel={pending ? "Bezig" : "Wijziging plannen"}
        confirmDisabled={pending || !targetSlug || (options?.length ?? 0) === 0}
      />
    </Dialog>
  );
}

function EmailCorrectionDialog({
  open,
  profileId,
  currentEmail,
  onClose,
}: {
  open: boolean;
  profileId: string;
  currentEmail: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CorrectEmailResult | null>(null);
  const [newEmail, setNewEmail] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await correctCustomerEmail({ profileId, newEmail });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onClose, 900);
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="E-mailadres corrigeren">
      <p className="text-text-muted text-sm mb-5">
        {/* COPY: confirm met Marlon */}
        Dit wijzigt het inlogadres van dit account. Het lid logt vanaf nu in
        met het nieuwe adres; het oude adres werkt niet meer. Gebruik dit
        alleen om een fout te corrigeren, niet om een account tussen twee
        personen over te dragen.
      </p>
      <AdminField label="Huidig adres" className="mb-4">
        <AdminInput type="email" value={currentEmail} disabled readOnly />
      </AdminField>
      <AdminField label="Nieuw e-mailadres" className="mb-6">
        <AdminInput
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          autoComplete="off"
        />
      </AdminField>
      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        confirmLabel={pending ? "Bezig" : "Adres corrigeren"}
        confirmDisabled={pending || !newEmail.trim()}
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

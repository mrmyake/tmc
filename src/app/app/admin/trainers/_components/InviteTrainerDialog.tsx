"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  AdminField,
  AdminInput,
  AdminSelect,
} from "@/components/ui/AdminField";
import {
  inviteTrainer,
  type TrainerActionResult,
} from "@/lib/admin/trainer-actions";
import type { EmploymentTier } from "@/lib/admin/trainer-query";
import { PILLARS, PILLAR_LABELS } from "@/lib/member/plan-coverage";

interface InviteTrainerDialogProps {
  open: boolean;
  onClose: () => void;
}

const TIERS: Array<{ value: EmploymentTier; label: string }> = [
  { value: "head_trainer", label: "Head Trainer" },
  { value: "trainer", label: "Trainer" },
  { value: "intern", label: "Stagiair" },
];

export function InviteTrainerDialog({
  open,
  onClose,
}: InviteTrainerDialogProps) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TrainerActionResult | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<EmploymentTier>("trainer");
  const [pillars, setPillars] = useState<Set<string>>(new Set());
  const [isPt, setIsPt] = useState(false);

  useEffect(() => {
    if (open && ref.current) {
      ref.current.showModal();
    }
    if (!open) {
      setFirstName("");
      setLastName("");
      setEmail("");
      setTier("trainer");
      setPillars(new Set());
      setIsPt(false);
      setResult(null);
    }
  }, [open]);

  function togglePillar(p: string) {
    const next = new Set(pillars);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPillars(next);
  }

  function submit() {
    startTransition(async () => {
      const res = await inviteTrainer({
        firstName,
        lastName,
        email,
        employmentTier: tier,
        pillarSpecialties: Array.from(pillars),
        isPtAvailable: isPt,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(close, 1200);
      }
    });
  }

  function close() {
    ref.current?.close();
    onClose();
  }

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={close}
      className="bg-bg border border-[color:var(--ink-500)] text-text p-8 w-[min(92vw,560px)] backdrop:bg-bg/55 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start justify-between mb-5">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
            Nieuwe trainer
          </span>
          <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl tracking-[-0.01em]">
            Uitnodigen via magic-link.
          </h3>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Sluit"
          className="text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      <p className="text-text-muted text-sm mb-6">
        We sturen een magic-link mail. De trainer logt daarna in met dat
        adres. Bio en foto komen uit Sanity Studio.
      </p>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <AdminField label="Voornaam">
          <AdminInput
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </AdminField>
        <AdminField label="Achternaam">
          <AdminInput
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </AdminField>
      </div>

      <AdminField label="E-mail" className="mb-5">
        <AdminInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </AdminField>

      <AdminField label="Rol" className="mb-5">
        <AdminSelect
          value={tier}
          onChange={(e) => setTier(e.target.value as EmploymentTier)}
        >
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </AdminSelect>
      </AdminField>

      <fieldset className="flex flex-col gap-2 mb-5">
        <legend className="tmc-eyebrow mb-2">Specialisaties</legend>
        <div className="flex flex-wrap gap-2">
          {PILLARS.map((p) => {
            const active = pillars.has(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePillar(p)}
                aria-pressed={active}
                className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] border transition-colors duration-300 cursor-pointer ${
                  active
                    ? "border-accent text-accent"
                    : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {PILLAR_LABELS[p]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="inline-flex items-center gap-3 mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={isPt}
          onChange={(e) => setIsPt(e.target.checked)}
        />
        <span className="text-sm text-text">Beschikbaar voor Personal Training</span>
      </label>

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
          onClick={close}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={
            pending ||
            !firstName.trim() ||
            !lastName.trim() ||
            !email.trim()
          }
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {pending ? "Bezig" : "Uitnodiging sturen"}
        </button>
      </div>
    </dialog>
  );
}

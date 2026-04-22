"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import type {
  EmploymentTier,
  TrainerDetail,
} from "@/lib/admin/trainer-query";
import {
  loadTrainerDetailAction,
  logAdminHours,
  toggleTrainerActive,
  toggleTrainerHealthAccess,
  updateTrainerTier,
  type TrainerActionResult,
} from "@/lib/admin/trainer-actions";
import { AvatarBubble } from "@/app/app/_shared/attendance/AvatarBubble";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import { HoursRow } from "./HoursRow";

const clubEase: [number, number, number, number] = [0.2, 0.7, 0.1, 1];

const DAY_LABEL = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];

const TIER_LABEL: Record<EmploymentTier, string> = {
  head_trainer: "Head Trainer",
  trainer: "Trainer",
  intern: "Stagiair",
};

interface TrainerDrawerProps {
  trainerId: string | null;
  onClose: () => void;
}

export function TrainerDrawer({ trainerId, onClose }: TrainerDrawerProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<TrainerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TrainerActionResult | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(new Date().toISOString().slice(0, 10));
  const [addHours, setAddHours] = useState("1");
  const [addNotes, setAddNotes] = useState("");
  const lastFocused = useRef<HTMLElement | null>(null);

  const open = Boolean(trainerId);

  useEffect(() => {
    if (!open || !trainerId) {
      setDetail(null);
      setResult(null);
      setAddOpen(false);
      return;
    }
    lastFocused.current = document.activeElement as HTMLElement;
    let cancelled = false;
    setLoading(true);
    loadTrainerDetailAction(trainerId).then((res) => {
      if (cancelled) return;
      setDetail(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, trainerId]);

  useEffect(() => {
    if (!open) {
      lastFocused.current?.focus?.();
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function refreshDetail() {
    if (!trainerId) return;
    const res = await loadTrainerDetailAction(trainerId);
    setDetail(res);
    router.refresh();
  }

  function onToggleActive() {
    if (!detail) return;
    const next = !detail.isActive;
    startTransition(async () => {
      const res = await toggleTrainerActive(detail.id, next);
      setResult(res);
      if (res.ok) await refreshDetail();
    });
  }

  function onTierChange(tier: EmploymentTier) {
    if (!detail) return;
    startTransition(async () => {
      const res = await updateTrainerTier(detail.id, tier);
      setResult(res);
      if (res.ok) await refreshDetail();
    });
  }

  function onToggleHealthAccess() {
    if (!detail) return;
    const next = !detail.hasHealthAccess;
    startTransition(async () => {
      const res = await toggleTrainerHealthAccess(detail.id, next);
      setResult(res);
      if (res.ok) await refreshDetail();
    });
  }

  function submitAddHours() {
    if (!detail) return;
    const hoursNum = Number(addHours);
    if (!(hoursNum > 0 && hoursNum <= 24)) {
      setResult({ ok: false, message: "Uren moeten tussen 0 en 24 liggen." });
      return;
    }
    startTransition(async () => {
      const res = await logAdminHours({
        trainerId: detail.id,
        workDate: addDate,
        hours: hoursNum,
        notes: addNotes,
      });
      setResult(res);
      if (res.ok) {
        setAddHours("1");
        setAddNotes("");
        setAddOpen(false);
        await refreshDetail();
      }
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Sluit"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: clubEase }}
            className="fixed inset-0 z-40 bg-bg/55 backdrop-blur-sm cursor-default"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="trainer-drawer-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.6, ease: clubEase }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[560px] bg-bg border-l border-[color:var(--ink-500)] flex flex-col text-text"
          >
            <div className="flex items-start justify-between p-8">
              <span className="tmc-eyebrow tmc-eyebrow--accent">
                Trainer-detail
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Sluit paneel"
                className="text-text-muted hover:text-text transition-colors cursor-pointer"
              >
                <X size={22} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-8 pb-6 flex-1 overflow-y-auto">
              {loading && (
                <div aria-hidden className="flex flex-col gap-4">
                  <div className="h-16 bg-bg-elevated animate-pulse" />
                  <div className="h-32 bg-bg-elevated animate-pulse" />
                </div>
              )}

              {!loading && !detail && (
                <p className="text-text-muted text-sm">
                  Trainer niet gevonden.
                </p>
              )}

              {!loading && detail && (
                <>
                  <div className="flex items-center gap-4 mb-8">
                    <AvatarBubble
                      firstName={detail.firstName || detail.displayName}
                      lastName={detail.lastName}
                      avatarUrl={detail.avatarUrl}
                      size={48}
                    />
                    <div className="min-w-0">
                      <h2
                        id="trainer-drawer-title"
                        className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em]"
                      >
                        {detail.displayName}
                      </h2>
                      <p className="text-text-muted text-sm mt-1">
                        {detail.email}
                      </p>
                      {detail.phone && (
                        <p className="text-text-muted text-sm">
                          {detail.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  {!detail.sanityId && (
                    <div
                      role="note"
                      className="mb-8 p-4 bg-bg-elevated border-l-4 border-[color:var(--warning)]"
                    >
                      <span className="tmc-eyebrow text-[color:var(--warning)] block mb-1">
                        Geen Sanity-profiel
                      </span>
                      <p className="text-text-muted text-xs leading-relaxed">
                        Bio, foto en certificeringen horen in Sanity Studio.
                        Maak een trainer-doc aan en koppel de ID terug in
                        Supabase.
                      </p>
                      <Link
                        href="/studio"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-accent hover:text-accent-hover transition-colors"
                      >
                        <ExternalLink size={12} strokeWidth={1.8} aria-hidden />
                        Naar Sanity Studio
                      </Link>
                    </div>
                  )}

                  {/* Role + active controls */}
                  <section className="mb-10 flex flex-col gap-5">
                    <label className="flex flex-col gap-2">
                      <span className="tmc-eyebrow">Rol</span>
                      <select
                        value={detail.employmentTier}
                        onChange={(e) =>
                          onTierChange(e.target.value as EmploymentTier)
                        }
                        disabled={pending}
                        className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent cursor-pointer"
                      >
                        {(
                          [
                            "head_trainer",
                            "trainer",
                            "intern",
                          ] as EmploymentTier[]
                        ).map((t) => (
                          <option key={t} value={t}>
                            {TIER_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex items-center justify-between gap-4 pt-2">
                      <div>
                        <span className="tmc-eyebrow block mb-1">Actief</span>
                        <p className="text-text text-sm">
                          {detail.isActive
                            ? "Zichtbaar in rooster en /trainers"
                            : "Verborgen, krijgt geen nieuwe sessies toegewezen"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onToggleActive}
                        disabled={pending}
                        className={`inline-flex items-center px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors duration-300 cursor-pointer ${
                          detail.isActive
                            ? "border-text-muted/30 text-text-muted hover:border-[color:var(--danger)] hover:text-[color:var(--danger)]"
                            : "border-accent/60 text-accent hover:bg-accent/10"
                        } disabled:opacity-50`}
                      >
                        {detail.isActive ? "Deactiveren" : "Activeren"}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-2">
                      <div>
                        <span className="tmc-eyebrow block mb-1">
                          Blessure-inzage
                        </span>
                        <p className="text-text text-sm">
                          {detail.hasHealthAccess
                            ? "Ziet de volledige intake-tekst bij deelnemers met blessure"
                            : "Ziet alleen de flag, niet de tekst"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onToggleHealthAccess}
                        disabled={pending}
                        aria-pressed={detail.hasHealthAccess}
                        className={`inline-flex items-center px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors duration-300 cursor-pointer ${
                          detail.hasHealthAccess
                            ? "border-accent/60 text-accent hover:bg-accent/10"
                            : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
                        } disabled:opacity-50`}
                      >
                        {detail.hasHealthAccess ? "Aan" : "Uit"}
                      </button>
                    </div>
                  </section>

                  <section className="mb-10 pb-8 border-b border-[color:var(--ink-500)]/60">
                    <span className="tmc-eyebrow block mb-3">
                      Specialisaties
                    </span>
                    {detail.pillarSpecialties.length === 0 ? (
                      <p className="text-text-muted text-sm">
                        Nog geen pijlers toegewezen.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {detail.pillarSpecialties.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text"
                          >
                            <span
                              aria-hidden
                              className="w-1.5 h-1.5 rounded-full bg-accent"
                            />
                            {PILLAR_LABELS[p as Pillar] ?? p}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="tmc-eyebrow mt-4 text-text-muted/80">
                      Wijzigen via Sanity Studio
                    </p>
                  </section>

                  <section className="mb-10">
                    <span className="tmc-eyebrow block mb-3">Vaste sessies</span>
                    {detail.scheduleSlots.length === 0 ? (
                      <p className="text-text-muted text-sm">
                        Geen actieve templates voor deze trainer.
                      </p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-[color:var(--ink-500)]/40">
                        {detail.scheduleSlots.map((s) => (
                          <li
                            key={s.id}
                            className="flex items-center gap-4 py-3 text-sm"
                          >
                            <span className="tabular-nums w-10 text-text-muted">
                              {DAY_LABEL[s.dayOfWeek] ?? "?"}
                            </span>
                            <span className="tabular-nums w-14 text-text">
                              {s.startTime.slice(0, 5)}
                            </span>
                            <span className="flex-1 text-text truncate">
                              {s.classTypeName}
                            </span>
                            <span className="text-xs text-text-muted tabular-nums">
                              {s.durationMinutes}min · {s.capacity}p
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="mb-10">
                    <div className="flex items-center justify-between mb-4">
                      <span className="tmc-eyebrow">
                        Urenregistratie · {detail.hoursThisMonth.toFixed(1)}u
                        deze maand
                      </span>
                      <button
                        type="button"
                        onClick={() => setAddOpen((v) => !v)}
                        className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors cursor-pointer"
                      >
                        {addOpen ? "Annuleren" : "+ Uren boeken"}
                      </button>
                    </div>

                    {addOpen && (
                      <div className="mb-6 p-4 bg-bg-elevated border border-[color:var(--ink-500)] flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex flex-col gap-1.5">
                            <span className="tmc-eyebrow">Datum</span>
                            <input
                              type="date"
                              value={addDate}
                              onChange={(e) => setAddDate(e.target.value)}
                              className="bg-bg border border-[color:var(--ink-500)] px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="tmc-eyebrow">Uren</span>
                            <input
                              type="number"
                              step="0.25"
                              min="0.25"
                              max="24"
                              value={addHours}
                              onChange={(e) => setAddHours(e.target.value)}
                              className="bg-bg border border-[color:var(--ink-500)] px-3 py-2 text-sm text-text tabular-nums focus:outline-none focus:border-accent"
                            />
                          </label>
                        </div>
                        <label className="flex flex-col gap-1.5">
                          <span className="tmc-eyebrow">
                            Notitie (optioneel)
                          </span>
                          <input
                            type="text"
                            value={addNotes}
                            onChange={(e) => setAddNotes(e.target.value)}
                            placeholder="Bv. PT-blok ochtend"
                            className="bg-bg border border-[color:var(--ink-500)] px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={submitAddHours}
                          disabled={pending}
                          className="self-start inline-flex items-center justify-center px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {pending ? "Bezig" : "Opslaan (goedgekeurd)"}
                        </button>
                      </div>
                    )}

                    {detail.hoursHistory.length === 0 ? (
                      <p className="text-text-muted text-sm">
                        Nog geen urenregistratie.
                      </p>
                    ) : (
                      <div className="flex flex-col">
                        {detail.hoursHistory.map((h) => (
                          <HoursRow key={h.id} row={h} />
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>

            {result && (
              <div
                role={result.ok ? "status" : "alert"}
                className={`m-8 mt-0 text-sm p-4 border ${
                  result.ok
                    ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
                    : "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
                }`}
              >
                {result.message}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

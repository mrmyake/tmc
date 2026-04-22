"use client";

import { AlertCircle } from "lucide-react";
import { AvatarBubble } from "@/app/app/_shared/attendance/AvatarBubble";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import type {
  EmploymentTier,
  TrainerListItem,
} from "@/lib/admin/trainer-query";

const TIER_LABEL: Record<EmploymentTier, string> = {
  head_trainer: "Head Trainer",
  trainer: "Trainer",
  intern: "Stagiair",
};

interface TrainerRowProps {
  trainer: TrainerListItem;
  onSelect: (id: string) => void;
  active: boolean;
}

export function TrainerRow({ trainer, onSelect, active }: TrainerRowProps) {
  const zeroHoursThisWeek = trainer.hoursThisWeek === 0 && trainer.isActive;

  return (
    <button
      type="button"
      onClick={() => onSelect(trainer.id)}
      aria-pressed={active}
      className={`w-full grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-5 px-2 py-5 text-left border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 cursor-pointer ${
        active ? "bg-bg-elevated" : "hover:bg-bg-elevated/60"
      } ${!trainer.isActive ? "opacity-60" : ""}`}
    >
      <AvatarBubble
        firstName={trainer.firstName || trainer.displayName}
        lastName={trainer.lastName}
        avatarUrl={trainer.avatarUrl}
        size={40}
      />

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text text-base font-medium truncate">
            {trainer.displayName}
          </span>
          {zeroHoursThisWeek && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--warning)]"
              title="Geen uren geregistreerd deze week"
            >
              <AlertCircle size={11} strokeWidth={1.8} aria-hidden />
              0u week
            </span>
          )}
          {!trainer.isActive && (
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
              Inactief
            </span>
          )}
          {!trainer.sanityId && (
            <span
              className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted"
              title="Geen gekoppeld Sanity-profiel"
            >
              Geen Sanity
            </span>
          )}
        </div>
        <div className="text-text-muted text-xs truncate mt-0.5">
          {trainer.email}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="tmc-eyebrow">
            {TIER_LABEL[trainer.employmentTier]}
          </span>
          {trainer.pillarSpecialties.slice(0, 3).map((p) => (
            <span
              key={p}
              className="text-[10px] uppercase tracking-[0.16em] text-text-muted"
            >
              {PILLAR_LABELS[p as Pillar] ?? p}
            </span>
          ))}
          {trainer.pillarSpecialties.length > 3 && (
            <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
              +{trainer.pillarSpecialties.length - 3}
            </span>
          )}
        </div>
      </div>

      <div className="hidden md:flex flex-col items-end">
        <span className="tmc-eyebrow">Deze week</span>
        <span className="text-text text-sm tabular-nums">
          {trainer.hoursThisWeek.toFixed(1)}u
        </span>
      </div>

      <div className="hidden md:flex flex-col items-end">
        <span className="tmc-eyebrow">Deze maand</span>
        <span className="text-text text-sm tabular-nums">
          {trainer.hoursThisMonth.toFixed(1)}u
        </span>
      </div>

      {trainer.pendingHoursCount > 0 ? (
        <span className="inline-flex items-center gap-2 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-accent border border-accent/40">
          {trainer.pendingHoursCount} te keuren
        </span>
      ) : (
        <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted/60">
          —
        </span>
      )}
    </button>
  );
}

"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { TrainerListItem } from "@/lib/admin/trainer-query";
import { TrainerRow } from "./_components/TrainerRow";
import { TrainerDrawer } from "./_components/TrainerDrawer";
import { InviteTrainerDialog } from "./_components/InviteTrainerDialog";

interface TrainersClientProps {
  trainers: TrainerListItem[];
}

export function TrainersClient({ trainers }: TrainersClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
        >
          <UserPlus size={14} strokeWidth={1.8} />
          Nieuwe trainer
        </button>
      </div>

      {trainers.length === 0 ? (
        <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
            Geen trainers
          </span>
          <p className="text-text-muted text-sm max-w-md mx-auto">
            Nodig een trainer uit om te beginnen.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
          {trainers.map((t) => (
            <li key={t.id}>
              <TrainerRow
                trainer={t}
                onSelect={setSelectedId}
                active={selectedId === t.id}
              />
            </li>
          ))}
        </ul>
      )}

      <TrainerDrawer
        trainerId={selectedId}
        onClose={() => setSelectedId(null)}
      />
      <InviteTrainerDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </>
  );
}

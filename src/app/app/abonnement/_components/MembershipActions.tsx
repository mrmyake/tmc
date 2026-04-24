"use client";

import { useRef } from "react";
import { PauseDialog } from "./PauseDialog";
import { CancellationDialog } from "./CancellationDialog";
import { trackMembershipCancelAttempt } from "@/lib/analytics";

interface MembershipActionsProps {
  membershipId: string;
  commitEndDate: string;
  canPause: boolean;
  canCancel: boolean;
  currentPlan: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MembershipActions({
  membershipId,
  commitEndDate,
  canPause,
  canCancel,
  currentPlan,
}: MembershipActionsProps) {
  const pauseRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLDialogElement>(null);

  if (!canPause && !canCancel) return null;

  const withinLockIn = new Date(commitEndDate) > new Date();

  function openCancel() {
    trackMembershipCancelAttempt({ withinLockIn, currentPlan });
    cancelRef.current?.showModal();
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        {canPause && (
          <button
            type="button"
            onClick={() => pauseRef.current?.showModal()}
            className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent cursor-pointer"
          >
            Pauze aanvragen
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={openCancel}
            className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors duration-300 self-start sm:self-auto py-3.5 cursor-pointer"
          >
            Abbo opzeggen
          </button>
        )}
      </div>

      {canPause && (
        <PauseDialog
          ref={pauseRef}
          membershipId={membershipId}
          minStartDate={todayIso()}
          onDone={() => pauseRef.current?.close()}
        />
      )}
      {canCancel && (
        <CancellationDialog
          ref={cancelRef}
          membershipId={membershipId}
          commitEndDate={commitEndDate}
          currentPlan={currentPlan}
          onDone={() => cancelRef.current?.close()}
        />
      )}
    </>
  );
}

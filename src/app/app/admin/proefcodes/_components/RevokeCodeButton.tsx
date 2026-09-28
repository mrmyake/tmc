"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { revokeTrialCode } from "@/lib/admin/trial-codes-actions";

export function RevokeCodeButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

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
          Code {code} kan daarna niet meer gebruikt worden. Dit is niet terug
          te draaien; maak zo nodig een nieuwe code aan. Boekingen die al met
          deze code zijn gemaakt blijven staan.
        </p>
        <DialogFooter
          result={result}
          onClose={() => setOpen(false)}
          onConfirm={confirm}
          // COPY: confirm met Marlon
          cancelLabel="Terug"
          confirmLabel={pending ? "Bezig" : "Intrekken"}
          confirmDisabled={pending || result?.ok === true}
          confirmTone="danger"
        />
      </Dialog>
    </>
  );
}

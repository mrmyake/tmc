"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cancelTrialBooking } from "@/lib/actions/trial-booking";

/**
 * Na de termijn staat de waarschuwing boven de knop en heeft de knop een
 * expliciet label, zodat de bezoeker bewust kiest om zonder terugbetaling
 * te annuleren (spec-community-growth.md §1, zelfservice).
 */
export function CancelTrialBookingButton({
  token,
  warning = null,
}: {
  token: string;
  warning?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  async function handleCancel() {
    setBusy(true);
    const res = await cancelTrialBooking(token);
    setBusy(false);
    setResult(res);
  }

  if (result?.ok) {
    return <p className="text-text-muted">{result.message}</p>;
  }

  return (
    <div>
      {warning && (
        <p className="text-sm text-[color:var(--warning)] border border-[color:var(--warning)]/40 px-4 py-3 mb-6">
          {warning}
        </p>
      )}
      <Button
        type="button"
        onClick={handleCancel}
        variant="secondary"
        className={busy ? "opacity-50 pointer-events-none" : ""}
      >
        {/* COPY: confirm met Marlon */}
        {busy
          ? "Bezig..."
          : warning
            ? "Toch annuleren zonder terugbetaling"
            : "Annuleer mijn proefles"}
      </Button>
      {result && !result.ok && (
        <p className="text-sm text-red-400 mt-4">{result.message}</p>
      )}
    </div>
  );
}

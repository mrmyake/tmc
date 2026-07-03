"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cancelTrialBooking } from "@/lib/actions/trial-booking";

export function CancelTrialBookingButton({ token }: { token: string }) {
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
      <Button
        type="button"
        onClick={handleCancel}
        variant="secondary"
        className={busy ? "opacity-50 pointer-events-none" : ""}
      >
        {/* COPY: confirm with Marlon */}
        {busy ? "Bezig..." : "Annuleer mijn proefles"}
      </Button>
      {result && !result.ok && (
        <p className="text-sm text-red-400 mt-4">{result.message}</p>
      )}
    </div>
  );
}

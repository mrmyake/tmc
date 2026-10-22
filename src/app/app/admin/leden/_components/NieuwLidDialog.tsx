"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { NieuweKlantVelden } from "../../_components/NieuweKlantVelden";
import { useNieuweKlantForm } from "../../_components/useNieuweKlantForm";
import type { CustomerProfile } from "@/lib/admin/customer-core";

interface NieuwLidDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Nieuw lid aanmaken vanaf het ledenoverzicht. Zelfde formulier, zelfde
 * validatie en dezelfde server-actie (findOrCreateCustomer) als "Nieuwe klant
 * aanmaken" in de betaalverzoek-wizard; geen eigen aanmaakpad.
 */
export function NieuwLidDialog({ open, onClose }: NieuwLidDialogProps) {
  return (
    // COPY: confirm met Marlon
    <Dialog open={open} onClose={onClose} title="Nieuw lid">
      <NieuwLidFormulier onClose={onClose} />
    </Dialog>
  );
}

// Eigen component binnen <Dialog>: Dialog rendert niets als hij dicht is,
// dus de formulierstate reset vanzelf bij sluiten.
function NieuwLidFormulier({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const form = useNieuweKlantForm({
    onResolved: (profile) => router.push(`/app/admin/leden/${profile.id}`),
  });

  return (
    <>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm mb-5">
        Naam en e-mail volstaan. Het lid logt later zelf in met dit adres.
      </p>

      <NieuweKlantVelden
        form={form}
        renderExisting={(existing) => <BestaandProfiel profile={existing} />}
      />

      <div className="mt-6">
        <DialogFooter
          onClose={onClose}
          onConfirm={form.submit}
          // COPY: confirm met Marlon
          confirmLabel={form.creating ? "Bezig..." : "Lid aanmaken"}
          confirmDisabled={!form.canCreate || form.creating}
        />
      </div>
    </>
  );
}

function BestaandProfiel({ profile }: { profile: CustomerProfile }) {
  const isMember = profile.role === "member";

  if (!isMember) {
    return (
      <div
        role="status"
        className="mt-4 p-4 border border-accent/40 text-sm text-text"
      >
        {/* COPY: confirm met Marlon */}
        Dit e-mailadres hoort bij een trainer- of admin-account.
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mt-4 p-4 border border-accent/40 text-sm text-text"
    >
      {/* COPY: confirm met Marlon */}
      Dit lid bestaat al: {profile.firstName} {profile.lastName} (
      {profile.email}).
      <Link
        href={`/app/admin/leden/${profile.id}`}
        className="block mt-2 text-accent underline underline-offset-4"
      >
        {/* COPY: confirm met Marlon */}
        Naar profiel
      </Link>
    </div>
  );
}

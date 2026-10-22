"use client";

import type { ReactNode } from "react";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import type { CustomerProfile } from "@/lib/admin/customer-core";
import type { NieuweKlantForm } from "./useNieuweKlantForm";

interface NieuweKlantVeldenProps {
  form: NieuweKlantForm;
  /** Wat er getoond wordt als het adres al bij een profiel hoort. */
  renderExisting: (profile: CustomerProfile) => ReactNode;
}

/**
 * De velden, het "bestaat al"-blok en de foutmelding van het
 * nieuwe-klant-formulier. De knop om te versturen hoort bij de aanroeper
 * (eigen knop in de wizard, DialogFooter in het venster).
 */
export function NieuweKlantVelden({
  form,
  renderExisting,
}: NieuweKlantVeldenProps) {
  const {
    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    emailRepeat,
    setEmailRepeat,
    emailsMatch,
    createError,
    foundExisting,
  } = form;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-4">
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

      <AdminField label="E-mail" className="mb-4">
        <AdminInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </AdminField>

      <AdminField
        label="E-mail (nogmaals)"
        className="mb-1"
        // COPY: confirm met Marlon
        hint="Moet exact overeenkomen, ter voorkoming van een tikfout naar andermans adres."
        error={
          email && emailRepeat && !emailsMatch
            ? // COPY: confirm met Marlon
              "Komt niet overeen met het eerste e-mailadres."
            : undefined
        }
      >
        <AdminInput
          type="email"
          value={emailRepeat}
          onChange={(e) => setEmailRepeat(e.target.value)}
        />
      </AdminField>

      {foundExisting && renderExisting(foundExisting)}

      {createError && (
        <div
          role="alert"
          className="mt-4 p-4 border border-[color:var(--danger)]/40 text-sm text-[color:var(--danger)]"
        >
          {createError}
        </div>
      )}
    </>
  );
}

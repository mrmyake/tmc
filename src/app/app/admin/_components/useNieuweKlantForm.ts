"use client";

import { useState, useTransition } from "react";
import { findOrCreateCustomer } from "@/lib/admin/customer-actions";
import type { CustomerProfile } from "@/lib/admin/customer-core";

interface UseNieuweKlantFormOptions {
  /**
   * Alleen aangeroepen bij een echte aanmaak (created: true). Een bestaand
   * profiel komt als `foundExisting` terug en laat de aanroeper kiezen wat
   * ermee gebeurt.
   */
  onResolved: (profile: CustomerProfile) => void;
}

/**
 * Formulierstate voor "nieuwe klant aanmaken", gedeeld door de
 * betaalverzoek-wizard (KlantStap) en het Nieuw lid-venster op het
 * ledenoverzicht. Er is een aanmaakpad: findOrCreateCustomer. De
 * client-side checks spiegelen alleen de server-side regels in
 * findOrCreateCustomerCore als UX-vangrail.
 */
export function useNieuweKlantForm({ onResolved }: UseNieuweKlantFormOptions) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [emailRepeat, setEmailRepeat] = useState("");
  const [creating, startCreate] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [foundExisting, setFoundExisting] = useState<CustomerProfile | null>(
    null,
  );

  const emailNormalized = email.trim().toLowerCase();
  const emailRepeatNormalized = emailRepeat.trim().toLowerCase();
  // Client-side spiegel van de server-side dubbel-invoer-eis in
  // findOrCreateCustomerCore: pas actief bij exacte, genormaliseerde match.
  const emailsMatch =
    emailNormalized.length > 0 && emailNormalized === emailRepeatNormalized;
  const canCreate =
    firstName.trim().length > 0 && lastName.trim().length > 0 && emailsMatch;

  function submit() {
    setCreateError(null);
    setFoundExisting(null);
    startCreate(async () => {
      const res = await findOrCreateCustomer({
        firstName,
        lastName,
        email,
        emailRepeat,
      });
      if (!res.ok) {
        setCreateError(res.error);
        return;
      }
      if (!res.created) {
        // Server vond een bestaand profiel op dit e-mailadres: geen
        // duplicaat gemaakt. Toon dat als resultaat, geen foutstaat.
        setFoundExisting(res.profile);
        return;
      }
      onResolved(res.profile);
    });
  }

  return {
    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    emailRepeat,
    setEmailRepeat,
    emailsMatch,
    canCreate,
    creating,
    createError,
    foundExisting,
    submit,
  };
}

export type NieuweKlantForm = ReturnType<typeof useNieuweKlantForm>;

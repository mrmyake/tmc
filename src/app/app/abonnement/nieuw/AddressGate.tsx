"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { saveRegistrationAddress } from "@/lib/actions/profile";

interface AddressGateProps {
  initial: {
    street_address: string | null;
    postal_code: string | null;
    city: string | null;
  };
}

export function AddressGate({ initial }: AddressGateProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await saveRegistrationAddress(formData);
      if (!res.ok) setError(res.error);
      // Success → server revalidates, page re-renders with plans unlocked.
    });
  }

  return (
    <section
      aria-labelledby="address-gate-title"
      className="relative bg-bg-elevated p-8 md:p-10 mb-14"
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
      />
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        Stap 01 · Adres
      </span>
      <h2
        id="address-gate-title"
        className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-3"
      >
        Waar mogen we je bereiken?
      </h2>
      <p className="text-text-muted text-sm leading-relaxed mb-8 max-w-xl">
        Voor facturering en contact via reguliere post. We delen dit niet en
        gebruiken &rsquo;t alleen voor administratie.
      </p>

      <form action={handleSubmit} className="flex flex-col gap-6">
        <Field label="Straat + nummer">
          <input
            type="text"
            name="street_address"
            required
            autoComplete="street-address"
            defaultValue={initial.street_address ?? ""}
            className={fieldInputClasses}
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-6">
          <Field label="Postcode">
            <input
              type="text"
              name="postal_code"
              required
              autoComplete="postal-code"
              defaultValue={initial.postal_code ?? ""}
              className={fieldInputClasses}
            />
          </Field>
          <Field label="Plaats">
            <input
              type="text"
              name="city"
              required
              autoComplete="address-level2"
              defaultValue={initial.city ?? ""}
              className={fieldInputClasses}
            />
          </Field>
        </div>

        {error && (
          <p role="alert" className="text-[color:var(--danger)] text-sm">
            {error}
          </p>
        )}

        <div className="pt-2">
          <Button
            type="submit"
            className={pending ? "opacity-50 pointer-events-none" : ""}
          >
            {pending ? "Opslaan" : "Ga verder naar abonnement"}
          </Button>
        </div>
      </form>
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { startGuestCheckout } from "@/lib/actions/guest-checkout";
import { openCheckout } from "@/lib/native/checkout";

const FIELDS = [
  ["email", "E-mailadres", "email"],
  ["firstName", "Voornaam", "text"],
  ["lastName", "Achternaam", "text"],
  ["phone", "Telefoon", "tel"],
  ["streetAddress", "Straat + nummer", "text"],
  ["postalCode", "Postcode", "text"],
  ["city", "Plaats", "text"],
] as const;

export function DevGuestCheckoutForm() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "");
    setMessage(null);
    startTransition(async () => {
      const res = await startGuestCheckout({
        slug: get("slug"),
        earlyMember: fd.get("earlyMember") === "on",
        email: get("email"),
        firstName: get("firstName"),
        lastName: get("lastName"),
        phone: get("phone"),
        streetAddress: get("streetAddress"),
        postalCode: get("postalCode"),
        city: get("city"),
        acquisition: { signup_path: "/dev/gastcheckout", first_touch_at: new Date().toISOString() },
        returnTarget: "web",
      });
      if (!res.ok) {
        setMessage(`${res.reason}${res.field ? ` (${res.field})` : ""}: ${res.error}${res.codeSent ? " [inlogcode verstuurd]" : ""}`);
        return;
      }
      setMessage(`ok: ${res.kind}, ${res.amountCents} cent, doorsturen naar Mollie...`);
      await openCheckout(res.checkoutUrl);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <Field label="Catalogus-slug">
        <input name="slug" defaultValue="groepslessen_2x" className={fieldInputClasses} />
      </Field>
      <label className="flex items-center gap-3 text-sm text-text-muted">
        <input type="checkbox" name="earlyMember" defaultChecked /> Early Member-intentie
      </label>
      {FIELDS.map(([name, label, type]) => (
        <Field key={name} label={label}>
          <input name={name} type={type} className={fieldInputClasses} autoComplete="off" />
        </Field>
      ))}
      {message && (
        <p role="status" className="text-sm text-text-muted border border-bg-subtle bg-bg-elevated px-4 py-3 break-words">
          {message}
        </p>
      )}
      <div>
        <Button type="submit" className={pending ? "opacity-50 pointer-events-none" : ""}>
          {pending ? "Bezig..." : "Start gastcheckout"}
        </Button>
      </div>
    </form>
  );
}

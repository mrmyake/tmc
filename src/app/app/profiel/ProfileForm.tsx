"use client";

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { updateProfile, type ActionResult } from "@/lib/actions/profile";
import { formatDateLong } from "@/lib/format-date";

interface Profile {
  first_name: string;
  last_name: string;
  phone: string | null;
  date_of_birth: string | null;
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res: ActionResult = await updateProfile(formData);
      if (res.ok) setEditing(false);
      else setError(res.error);
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-6">
        <Row label="Voornaam" value={profile.first_name} />
        <Row label="Achternaam" value={profile.last_name} />
        <Row label="Telefoon" value={profile.phone || "—"} />
        <Row
          label="Geboortedatum"
          value={
            profile.date_of_birth
              ? formatDateLong(new Date(profile.date_of_birth))
              : "—"
          }
        />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 inline-flex items-center gap-2 self-start text-xs font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-accent cursor-pointer"
        >
          <Pencil size={14} strokeWidth={1.5} />
          Wijzigen
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Field label="Voornaam">
          <input
            type="text"
            name="first_name"
            defaultValue={profile.first_name}
            required
            autoComplete="given-name"
            className={fieldInputClasses}
          />
        </Field>
        <Field label="Achternaam">
          <input
            type="text"
            name="last_name"
            defaultValue={profile.last_name}
            required
            autoComplete="family-name"
            className={fieldInputClasses}
          />
        </Field>
      </div>
      <Field label="Telefoon">
        <input
          type="tel"
          name="phone"
          defaultValue={profile.phone ?? ""}
          autoComplete="tel"
          className={fieldInputClasses}
        />
      </Field>
      <Field label="Geboortedatum">
        <input
          type="date"
          name="date_of_birth"
          defaultValue={profile.date_of_birth ?? ""}
          className={fieldInputClasses}
        />
      </Field>

      {error && (
        <p role="alert" className="text-[color:var(--danger)] text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" className={pending ? "opacity-50 pointer-events-none" : ""}>
          {pending ? "Opslaan" : "Wijzigingen opslaan"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text cursor-pointer"
        >
          <X size={14} strokeWidth={1.5} />
          Annuleren
        </button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 sm:gap-6 pb-5 border-b border-[color:var(--ink-500)]/60 last:border-b-0 last:pb-0">
      <span className="tmc-eyebrow">{label}</span>
      <span className="text-text text-base">{value}</span>
    </div>
  );
}

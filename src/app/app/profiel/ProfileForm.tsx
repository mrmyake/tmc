"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { updateProfile, type ActionResult } from "@/lib/actions/profile";

const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

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
      if (res.ok) {
        setEditing(false);
      } else {
        setError(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="space-y-4">
        <Row label="Voornaam" value={profile.first_name} />
        <Row label="Achternaam" value={profile.last_name} />
        <Row label="Telefoon" value={profile.phone || "—"} />
        <Row label="Geboortedatum" value={profile.date_of_birth || "—"} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-accent hover:text-accent-hover transition-colors cursor-pointer mt-4"
        >
          <Pencil size={14} />
          Bewerken
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Voornaam" name="first_name" defaultValue={profile.first_name} required />
      <Field label="Achternaam" name="last_name" defaultValue={profile.last_name} required />
      <Field label="Telefoon" name="phone" type="tel" defaultValue={profile.phone ?? ""} />
      <Field
        label="Geboortedatum"
        name="date_of_birth"
        type="date"
        defaultValue={profile.date_of_birth ?? ""}
      />

      {error && (
        <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" className={pending ? "opacity-50 pointer-events-none" : ""}>
          <Check size={16} className="mr-2" />
          {pending ? "Opslaan..." : "Opslaan"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-text-muted hover:text-text transition-colors cursor-pointer px-4"
        >
          <X size={14} />
          Annuleren
        </button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 py-2 border-b border-bg-subtle/70 last:border-0">
      <span className="text-xs uppercase tracking-[0.2em] text-text-muted pt-1">
        {label}
      </span>
      <span className="text-text">{value}</span>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.2em] text-text-muted mb-2">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className={inputStyles}
      />
    </label>
  );
}

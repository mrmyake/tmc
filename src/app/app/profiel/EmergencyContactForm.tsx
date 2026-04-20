"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { updateEmergencyContact, type ActionResult } from "@/lib/actions/profile";

const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

interface Props {
  name: string | null;
  phone: string | null;
}

export function EmergencyContactForm({ name, phone }: Props) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res: ActionResult = await updateEmergencyContact(formData);
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
        <Row label="Naam" value={name || "Nog niet ingevuld"} />
        <Row label="Telefoon" value={phone || "—"} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-accent hover:text-accent-hover transition-colors cursor-pointer mt-4"
        >
          <Pencil size={14} />
          {name ? "Bewerken" : "Toevoegen"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="block text-xs uppercase tracking-[0.2em] text-text-muted mb-2">
          Naam
        </span>
        <input
          type="text"
          name="emergency_contact_name"
          defaultValue={name ?? ""}
          className={inputStyles}
        />
      </label>
      <label className="block">
        <span className="block text-xs uppercase tracking-[0.2em] text-text-muted mb-2">
          Telefoon
        </span>
        <input
          type="tel"
          name="emergency_contact_phone"
          defaultValue={phone ?? ""}
          className={inputStyles}
        />
      </label>

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

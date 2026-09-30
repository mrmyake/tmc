"use client";

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { updateProfile, type ActionResult } from "@/lib/actions/profile";
import { formatDateLong } from "@/lib/format-date";
import { validateProfileField, type ProfileField } from "@/lib/profile-validation";

// Velden van dit formulier met een eigen validatie; telefoon is optioneel.
const REQUIRED_FIELDS: Partial<Record<ProfileField, boolean>> = {
  first_name: true,
  last_name: true,
  phone: false,
};
type FieldErrors = Partial<Record<ProfileField, string>>;

function isValidatedField(name: string): name is ProfileField {
  return name in REQUIRED_FIELDS;
}

interface Profile {
  first_name: string;
  last_name: string;
  phone: string | null;
  date_of_birth: string | null;
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  function focusField(form: HTMLFormElement, name: ProfileField) {
    (form.elements.namedItem(name) as HTMLInputElement | null)?.focus();
  }

  function handleBlur(e: React.FocusEvent<HTMLFormElement>) {
    const { name, value } = e.target as unknown as HTMLInputElement;
    if (!isValidatedField(name)) return;
    const msg = validateProfileField(name, value, {
      required: REQUIRED_FIELDS[name] === true,
    });
    setFieldErrors((prev) => ({ ...prev, [name]: msg ?? undefined }));
  }

  function handleChange(e: React.ChangeEvent<HTMLFormElement>) {
    const { name } = e.target as unknown as HTMLInputElement;
    if (isValidatedField(name) && fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    const errors: FieldErrors = {};
    for (const name of Object.keys(REQUIRED_FIELDS) as ProfileField[]) {
      const msg = validateProfileField(name, String(formData.get(name) ?? ""), {
        required: REQUIRED_FIELDS[name] === true,
      });
      if (msg) errors[name] = msg;
    }
    setFieldErrors(errors);
    const firstInvalid = (Object.keys(REQUIRED_FIELDS) as ProfileField[]).find(
      (n) => errors[n],
    );
    if (firstInvalid) {
      setError(errors[firstInvalid] as string);
      focusField(form, firstInvalid);
      return;
    }

    startTransition(async () => {
      const res: ActionResult = await updateProfile(formData);
      if (res.ok) {
        setEditing(false);
        return;
      }
      setError(res.error);
      if (res.field) {
        setFieldErrors({ [res.field]: res.error });
        focusField(form, res.field);
      }
    });
  }

  function fieldProps(name: ProfileField) {
    const id = `profile-${name}-error`;
    return {
      field: { error: fieldErrors[name], errorId: id },
      input: {
        "aria-invalid": fieldErrors[name] ? (true as const) : undefined,
        "aria-describedby": fieldErrors[name] ? id : undefined,
      },
    };
  }

  const addressLines = [
    profile.street_address,
    [profile.postal_code, profile.city].filter(Boolean).join("  "),
  ].filter(Boolean) as string[];
  const addressDisplay =
    addressLines.length > 0 ? addressLines.join("\n") : "—";

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
        <Row label="Adres" value={addressDisplay} multiline />
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
    <form
      onSubmit={handleSubmit}
      onBlur={handleBlur}
      onChange={handleChange}
      noValidate
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Field label="Voornaam" {...fieldProps("first_name").field}>
          <input
            type="text"
            name="first_name"
            {...fieldProps("first_name").input}
            defaultValue={profile.first_name}
            required
            autoComplete="given-name"
            className={fieldInputClasses}
          />
        </Field>
        <Field label="Achternaam" {...fieldProps("last_name").field}>
          <input
            type="text"
            name="last_name"
            {...fieldProps("last_name").input}
            defaultValue={profile.last_name}
            required
            autoComplete="family-name"
            className={fieldInputClasses}
          />
        </Field>
      </div>
      <Field label="Telefoon" {...fieldProps("phone").field}>
        <input
          type="tel"
          name="phone"
            {...fieldProps("phone").input}
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

      <div className="pt-4 border-t border-[color:var(--ink-500)]/60">
        <span className="tmc-eyebrow block mb-5">Adres</span>
        <div className="flex flex-col gap-6">
          <Field label="Straat + nummer">
            <input
              type="text"
              name="street_address"
              defaultValue={profile.street_address ?? ""}
              autoComplete="street-address"
              className={fieldInputClasses}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-6">
            <Field label="Postcode">
              <input
                type="text"
                name="postal_code"
                defaultValue={profile.postal_code ?? ""}
                autoComplete="postal-code"
                className={fieldInputClasses}
              />
            </Field>
            <Field label="Plaats">
              <input
                type="text"
                name="city"
                defaultValue={profile.city ?? ""}
                autoComplete="address-level2"
                className={fieldInputClasses}
              />
            </Field>
          </div>
        </div>
      </div>

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
            setFieldErrors({});
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

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 sm:gap-6 pb-5 border-b border-[color:var(--ink-500)]/60 last:border-b-0 last:pb-0">
      <span className="tmc-eyebrow">{label}</span>
      <span
        className={`text-text text-base ${multiline ? "whitespace-pre-line" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

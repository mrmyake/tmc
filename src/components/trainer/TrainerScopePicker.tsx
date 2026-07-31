"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminField, AdminSelect } from "@/components/ui/AdminField";
import type { TrainerScopeOption } from "@/lib/trainer/trainer-scope";

interface TrainerScopePickerProps {
  /** Alleen admins krijgen de kiezer; een trainer ziet altijd de eigen data. */
  isAdmin: boolean;
  options: TrainerScopeOption[];
  selectedTrainerId: string | null;
  className?: string;
}

/**
 * Trainer-kiezer voor de /app/trainer/**-schermen. Bewust generiek: leest
 * het huidige pad en de bestaande queryparams, en zet alleen trainerId om.
 * Daardoor werkt hij op elk trainer-scherm (agenda, boeken, klant, home,
 * sessies, uren) zonder per pagina overgeschreven te worden, en blijven
 * scherm-eigen params zoals view/date/week staan bij het wisselen.
 *
 * Rendert niets voor een niet-admin: die heeft per definitie één optie.
 */
export function TrainerScopePicker({
  isAdmin,
  options,
  selectedTrainerId,
  className = "",
}: TrainerScopePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!isAdmin || options.length === 0) return null;

  function handleChange(trainerId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("trainerId", trainerId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={`max-w-xs w-full sm:w-56 ${className}`}>
      {/* COPY: confirm met Marlon */}
      <AdminField label="Trainer">
        <AdminSelect
          value={selectedTrainerId ?? ""}
          onChange={(e) => handleChange(e.target.value)}
        >
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </AdminSelect>
      </AdminField>
    </div>
  );
}

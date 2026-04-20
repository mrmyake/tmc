"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  submitHealthIntake,
  type HealthIntakePayload,
} from "@/lib/actions/profile";

const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

const textareaStyles = `${inputStyles} resize-none`;

type IntakeInitial = Partial<HealthIntakePayload>;

export function IntakeForm({ initial }: { initial: IntakeInitial }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitHealthIntake(formData);
      // Server action redirect'ed op succes; we komen hier alleen bij fout.
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Section
        label="Blessures"
        hint="Huidige of chronische blessures, pijnklachten of fysieke beperkingen. Laat leeg als niet van toepassing."
      >
        <textarea
          name="injuries"
          rows={3}
          defaultValue={initial.injuries ?? ""}
          placeholder="Bijv. lichte knie-klachten, hernia L4-L5, of niks."
          className={textareaStyles}
        />
      </Section>

      <Section
        label="Medicatie"
        hint="Medicatie die invloed kan hebben op training (bloeddruk, hormonen, bloedverdunners, etc.). Laat leeg als niet van toepassing."
      >
        <textarea
          name="medications"
          rows={3}
          defaultValue={initial.medications ?? ""}
          className={textareaStyles}
        />
      </Section>

      <Section label="Zwangerschap">
        <div className="space-y-3">
          <select
            name="pregnancy_status"
            defaultValue={initial.pregnancy_status ?? "not_applicable"}
            className={inputStyles}
          >
            <option value="not_applicable">Niet van toepassing</option>
            <option value="none">Niet zwanger</option>
            <option value="pregnant">Zwanger</option>
            <option value="post_partum">Post-partum (na zwangerschap)</option>
          </select>
          <textarea
            name="pregnancy_notes"
            rows={2}
            placeholder="Optioneel: week, bijzonderheden, postpartum datum..."
            defaultValue={initial.pregnancy_notes ?? ""}
            className={textareaStyles}
          />
        </div>
      </Section>

      <Section
        label="Jouw doelen *"
        hint="Wat wil je bereiken met training? Verplicht."
      >
        <textarea
          name="goals"
          rows={3}
          required
          defaultValue={initial.goals ?? ""}
          placeholder="Bijv. sterker worden, klachten in onderrug kwijt, meer energie, voorbereiden op bevalling..."
          className={textareaStyles}
        />
      </Section>

      <Section label="Ervaring">
        <select
          name="experience_level"
          defaultValue={initial.experience_level ?? "beginner"}
          className={inputStyles}
        >
          <option value="beginner">Beginner — weinig tot geen ervaring</option>
          <option value="intermediate">Gemiddeld — ik train regelmatig</option>
          <option value="advanced">Gevorderd — ik train al jaren</option>
        </select>
      </Section>

      <Section
        label="Nog iets dat we moeten weten?"
        hint="Optioneel. Dingen waar Marlon of je trainer rekening mee moet houden."
      >
        <textarea
          name="additional_notes"
          rows={3}
          defaultValue={initial.additional_notes ?? ""}
          className={textareaStyles}
        />
      </Section>

      {error && (
        <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
          {error}
        </div>
      )}

      <div className="pt-4 border-t border-bg-subtle">
        <Button type="submit" className={pending ? "opacity-50 pointer-events-none" : ""}>
          {pending ? "Opslaan..." : "Health intake opslaan"}
        </Button>
        <p className="text-xs text-text-muted mt-4 max-w-xl">
          Je gegevens worden alleen gedeeld met Marlon en je trainer, en zijn
          nooit publiek zichtbaar. Je kunt ze altijd bijwerken via je profiel.
        </p>
      </div>
    </form>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block mb-2">
        <span className="block text-xs uppercase tracking-[0.2em] text-text-muted">
          {label}
        </span>
      </label>
      {hint && (
        <p className="text-sm text-text-muted mb-3 leading-relaxed">{hint}</p>
      )}
      {children}
    </div>
  );
}

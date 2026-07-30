"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import {
  submitHealthIntake,
  type HealthIntakePayload,
} from "@/lib/actions/profile";

type IntakeInitial = Partial<HealthIntakePayload>;

type PregnancyStatus = HealthIntakePayload["pregnancy_status"];
type ExperienceLevel = HealthIntakePayload["experience_level"];

interface IntakeFormProps {
  initial: IntakeInitial;
}

type Draft = HealthIntakePayload;

const DRAFT_KEY = "tmc_intake_draft_v1";

const INITIAL_DRAFT: Draft = {
  injuries: "",
  medications: "",
  pregnancy_status: "not_applicable",
  pregnancy_notes: "",
  goals: "",
  experience_level: "beginner",
  additional_notes: "",
};

const STEPS = [
  { id: "injuries", label: "Blessures" },
  { id: "medications", label: "Medicatie" },
  { id: "pregnancy", label: "Zwangerschap" },
  { id: "goals", label: "Doelen" },
  { id: "experience", label: "Ervaring" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function IntakeForm({ initial }: IntakeFormProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    ...INITIAL_DRAFT,
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Hydrate from sessionStorage — client-only.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(DRAFT_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<Draft>;
      setDraft((prev) => ({ ...prev, ...parsed }));
    } catch {
      // corrupt draft — ignore
    }
  }, []);

  // Persist draft on every change.
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // quota full or disabled — silently ignore
    }
  }, [draft]);

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function goNext() {
    if (step.id === "goals" && !draft.goals.trim()) {
      setError("Laat ons weten wat je doel is voor we verder gaan.");
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  async function handleSubmit() {
    if (!draft.goals.trim()) {
      setStepIndex(STEPS.findIndex((s) => s.id === "goals"));
      setError("Laat ons eerst weten wat je doel is.");
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("injuries", draft.injuries);
    formData.set("medications", draft.medications);
    formData.set("pregnancy_status", draft.pregnancy_status);
    formData.set("pregnancy_notes", draft.pregnancy_notes);
    formData.set("goals", draft.goals);
    formData.set("experience_level", draft.experience_level);
    formData.set("additional_notes", draft.additional_notes);
    startTransition(async () => {
      const res = await submitHealthIntake(formData);
      if (res && !res.ok) {
        setError(res.error);
      } else {
        // Success path: server action redirects. Clear draft.
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
      }
    });
  }

  return (
    <div>
      <Stepper current={stepIndex} />

      <section className="mt-14 min-h-[18rem]">
        {step.id === "injuries" && (
          <StepInjuries
            value={draft.injuries}
            onChange={(v) => updateDraft("injuries", v)}
          />
        )}
        {step.id === "medications" && (
          <StepMedications
            value={draft.medications}
            onChange={(v) => updateDraft("medications", v)}
          />
        )}
        {step.id === "pregnancy" && (
          <StepPregnancy
            status={draft.pregnancy_status}
            notes={draft.pregnancy_notes}
            onStatusChange={(v) => updateDraft("pregnancy_status", v)}
            onNotesChange={(v) => updateDraft("pregnancy_notes", v)}
          />
        )}
        {step.id === "goals" && (
          <StepGoals
            value={draft.goals}
            onChange={(v) => updateDraft("goals", v)}
          />
        )}
        {step.id === "experience" && (
          <StepExperience
            level={draft.experience_level}
            notes={draft.additional_notes}
            onLevelChange={(v) => updateDraft("experience_level", v)}
            onNotesChange={(v) => updateDraft("additional_notes", v)}
          />
        )}
      </section>

      {error && (
        <p role="alert" className="mt-8 text-[color:var(--danger)] text-sm">
          {error}
        </p>
      )}

      <div className="mt-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6 border-t border-[color:var(--ink-500)]/60">
        <button
          type="button"
          onClick={goBack}
          disabled={isFirst}
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          Vorige
        </button>
        {isLast ? (
          <Button
            onClick={handleSubmit}
            className={pending ? "opacity-50 pointer-events-none" : ""}
          >
            {pending ? "Versturen" : "Intake opslaan"}
          </Button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-2 px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover cursor-pointer"
          >
            Volgende
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
      <p className="mt-6 text-text-muted text-xs">
        Je antwoorden worden lokaal tussenopgeslagen. Kom je later terug, dan
        pak je waar je was.
      </p>
    </div>
  );
}

// ---------- Stepper ---------------------------------------------------------

function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Voortgang" className="flex items-center gap-3">
      {STEPS.map((s, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div key={s.id} className="flex-1 flex items-center gap-3">
            <div className="flex flex-col items-start gap-2 flex-1">
              <span
                className={`h-px w-full ${
                  done || active ? "bg-accent" : "bg-[color:var(--ink-500)]/60"
                }`}
                aria-hidden
              />
              <span
                className={`text-[10px] font-medium uppercase tracking-[0.18em] ${
                  active
                    ? "text-accent"
                    : done
                      ? "text-text-muted"
                      : "text-text-muted/60"
                }`}
              >
                {String(i + 1).padStart(2, "0")} · {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ---------- Step bodies -----------------------------------------------------

function StepIntro({
  eyebrow,
  title,
  hint,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
}) {
  return (
    <header className="mb-8">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        {eyebrow}
      </span>
      <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4">
        {title}
      </h2>
      {hint && (
        <p className="text-text-muted text-base leading-relaxed max-w-xl">
          {hint}
        </p>
      )}
    </header>
  );
}

function StepInjuries({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <StepIntro
        eyebrow="Stap 01 · Blessures"
        title="Wat moet Marlon weten over je lichaam?"
        hint="Huidige of chronische klachten, blessures, fysieke beperkingen. Laat leeg als niets speelt — de training bouwen we altijd op wat je aankan."
      />
      <Field label="Blessures of klachten" hint="Optioneel">
        <textarea
          rows={5}
          placeholder="Bijv. lichte knie-klachten, hernia L4-L5, of niks bijzonders."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldInputClasses} resize-none`}
        />
      </Field>
    </>
  );
}

function StepMedications({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <StepIntro
        eyebrow="Stap 02 · Medicatie"
        title="Gebruik je medicatie die invloed heeft op training?"
        hint="Denk aan bloeddruk, hormonen, bloedverdunners of vergelijkbaar. Laat leeg als niet van toepassing."
      />
      <Field label="Medicatie" hint="Optioneel">
        <textarea
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldInputClasses} resize-none`}
        />
      </Field>
    </>
  );
}

function StepPregnancy({
  status,
  notes,
  onStatusChange,
  onNotesChange,
}: {
  status: PregnancyStatus;
  notes: string;
  onStatusChange: (v: PregnancyStatus) => void;
  onNotesChange: (v: string) => void;
}) {
  return (
    <>
      <StepIntro
        eyebrow="Stap 03 · Zwangerschap"
        title="Is er iets om rekening mee te houden?"
        hint="We stemmen de training graag af op waar je bent. Sla gerust over als niet van toepassing."
      />
      <div className="flex flex-col gap-6">
        <Field label="Status">
          <div className="relative">
            <select
              value={status}
              onChange={(e) =>
                onStatusChange(e.target.value as PregnancyStatus)
              }
              className={`${fieldInputClasses} appearance-none pr-8`}
            >
              <option value="not_applicable">Niet van toepassing</option>
              <option value="none">Niet zwanger</option>
              <option value="pregnant">Zwanger</option>
              <option value="post_partum">Post-partum</option>
            </select>
            <ChevronDown
              size={16}
              strokeWidth={1.5}
              aria-hidden
              className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
          </div>
        </Field>
        <Field label="Toelichting" hint="Optioneel">
          <textarea
            rows={3}
            placeholder="Week, bijzonderheden, post-partum datum..."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className={`${fieldInputClasses} resize-none`}
          />
        </Field>
      </div>
    </>
  );
}

function StepGoals({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <StepIntro
        eyebrow="Stap 04 · Jouw doelen"
        title="Waar wil je naartoe?"
        hint="De enige vraag die we verplicht stellen. Hoe scherper je 'm beantwoordt, hoe gerichter we programmeren."
      />
      <Field label="Doelen">
        <textarea
          rows={5}
          required
          placeholder="Bijv. sterker worden, klachten in onderrug kwijt, voorbereiden op bevalling, weer marathon lopen..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldInputClasses} resize-none`}
        />
      </Field>
    </>
  );
}

function StepExperience({
  level,
  notes,
  onLevelChange,
  onNotesChange,
}: {
  level: ExperienceLevel;
  notes: string;
  onLevelChange: (v: ExperienceLevel) => void;
  onNotesChange: (v: string) => void;
}) {
  return (
    <>
      <StepIntro
        eyebrow="Stap 05 · Ervaring"
        title="Hoe is je verleden met training?"
        hint="Een context-check zodat we niet te diep of te ondiep beginnen."
      />
      <div className="flex flex-col gap-6">
        <Field label="Niveau">
          <div className="relative">
            <select
              value={level}
              onChange={(e) => onLevelChange(e.target.value as ExperienceLevel)}
              className={`${fieldInputClasses} appearance-none pr-8`}
            >
              <option value="beginner">Beginner — weinig tot geen ervaring</option>
              <option value="intermediate">Gemiddeld — ik train regelmatig</option>
              <option value="advanced">Gevorderd — ik train al jaren</option>
            </select>
            <ChevronDown
              size={16}
              strokeWidth={1.5}
              aria-hidden
              className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
          </div>
        </Field>
        <Field label="Nog iets toe te voegen" hint="Optioneel">
          <textarea
            rows={3}
            placeholder="Iets wat Marlon of je trainer moet weten."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className={`${fieldInputClasses} resize-none`}
          />
        </Field>
      </div>
    </>
  );
}

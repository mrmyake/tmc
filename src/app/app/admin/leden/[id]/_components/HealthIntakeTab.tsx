import { formatShortDate } from "@/lib/format-date";
import type { MemberDetail } from "@/lib/admin/member-detail-query";

const PREGNANCY_LABEL: Record<string, string> = {
  none: "Niet van toepassing",
  pregnant: "Zwanger",
  post_partum: "Post-partum",
  not_applicable: "Niet van toepassing",
};

const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Gevorderd",
  advanced: "Ervaren",
};

export function HealthIntakeTab({ detail }: { detail: MemberDetail }) {
  const { healthNotes, healthIntakeCompletedAt } = detail.profile;

  if (!healthNotes || !healthIntakeCompletedAt) {
    return (
      <div className="py-12 text-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          Nog niet ingevuld
        </span>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          Dit lid heeft de health intake nog niet ingediend. Stuur een
          herinnering via de Notities-tab of vraag persoonlijk.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <p className="tmc-eyebrow">
        Ingevuld op {formatShortDate(new Date(healthIntakeCompletedAt))}
      </p>

      {healthNotes.injuries && (
        <Section label="Blessures / let op" tone="warning">
          {healthNotes.injuries}
        </Section>
      )}

      <Section label="Doelen">
        {healthNotes.goals || "—"}
      </Section>

      <Section label="Ervaring">
        {EXPERIENCE_LABEL[healthNotes.experience_level] ??
          healthNotes.experience_level}
      </Section>

      {healthNotes.medications && (
        <Section label="Medicatie">{healthNotes.medications}</Section>
      )}

      {healthNotes.pregnancy_status &&
        healthNotes.pregnancy_status !== "not_applicable" && (
          <Section label="Zwangerschap">
            <span className="block mb-1">
              {PREGNANCY_LABEL[healthNotes.pregnancy_status] ??
                healthNotes.pregnancy_status}
            </span>
            {healthNotes.pregnancy_notes && (
              <span className="text-text-muted text-sm leading-relaxed">
                {healthNotes.pregnancy_notes}
              </span>
            )}
          </Section>
        )}

      {healthNotes.additional_notes && (
        <Section label="Overige notities">
          {healthNotes.additional_notes}
        </Section>
      )}
    </div>
  );
}

function Section({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "warning";
  children: React.ReactNode;
}) {
  const labelClass =
    tone === "warning"
      ? "tmc-eyebrow text-[color:var(--warning)]"
      : "tmc-eyebrow";
  return (
    <section
      className={`pb-6 border-b border-[color:var(--ink-500)]/60 ${
        tone === "warning"
          ? "pl-5 border-l-4 border-l-[color:var(--warning)] bg-bg-elevated p-5 border-b-0"
          : ""
      }`}
    >
      <span className={`${labelClass} block mb-2`}>{label}</span>
      <div className="text-text text-sm leading-relaxed whitespace-pre-wrap">
        {children}
      </div>
    </section>
  );
}

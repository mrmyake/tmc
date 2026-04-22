import { formatEuro } from "@/lib/crowdfunding-helpers";
import { formatShortDate } from "@/lib/format-date";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import type { MemberDetail } from "@/lib/admin/member-detail-query";

interface OverviewTabProps {
  detail: MemberDetail;
}

export function OverviewTab({ detail }: OverviewTabProps) {
  const { profile, primaryMembership, stats } = detail;

  const lastSessionLabel = stats.lastSessionAt
    ? formatShortDate(new Date(stats.lastSessionAt))
    : "Nog geen sessie";
  const favoriteLabel = stats.favoritePillar
    ? (PILLAR_LABELS[stats.favoritePillar as Pillar] ?? stats.favoritePillar)
    : "—";

  return (
    <section className="flex flex-col gap-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
        <StatTile
          label="Sessies"
          value={String(stats.totalSessions)}
          hint={`${stats.attendedSessions} bijgewoond`}
        />
        <StatTile label="Favoriete pilaar" value={favoriteLabel} />
        <StatTile label="Laatste sessie" value={lastSessionLabel} />
        <StatTile
          label="MRR"
          value={
            stats.mrrCents > 0
              ? formatEuro(Math.round(stats.mrrCents / 100))
              : "—"
          }
          hint={
            primaryMembership?.status === "active"
              ? "Actief abonnement"
              : "Geen actieve MRR"
          }
        />
      </div>

      {stats.activeStrikes > 0 && (
        <aside
          role="note"
          className="p-5 border border-[color:var(--warning)]/40 border-l-4 border-l-[color:var(--warning)] bg-bg-elevated"
        >
          <span className="tmc-eyebrow text-[color:var(--warning)] block mb-2">
            No-show strikes
          </span>
          <p className="text-text text-sm leading-relaxed">
            Dit lid heeft {stats.activeStrikes} actieve strike
            {stats.activeStrikes === 1 ? "" : "s"} binnen het 30-daagse venster.
            {stats.activeStrikes >= 3 ? " Booking is tijdelijk geblokkeerd." : ""}
          </p>
        </aside>
      )}

      <section>
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text tracking-[-0.01em] mb-6">
          Contact &amp; profiel
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
          <DetailRow label="E-mail" value={profile.email} />
          <DetailRow label="Telefoon" value={profile.phone ?? "—"} />
          <DetailRow
            label="Adres"
            value={[
              profile.streetAddress,
              [profile.postalCode, profile.city].filter(Boolean).join(" "),
              profile.country,
            ]
              .filter(Boolean)
              .join(", ") || "—"}
          />
          <DetailRow
            label="Geboortedatum"
            value={profile.dateOfBirth ?? "—"}
          />
          <DetailRow
            label="Noodcontact"
            value={
              profile.emergencyContactName
                ? `${profile.emergencyContactName} · ${profile.emergencyContactPhone ?? "—"}`
                : "—"
            }
          />
          <DetailRow
            label="Marketing opt-in"
            value={profile.marketingOptIn ? "Aan" : "Uit"}
          />
          <DetailRow
            label="Lid sinds"
            value={formatShortDate(new Date(profile.createdAt))}
          />
          <DetailRow
            label="Health intake"
            value={
              profile.healthIntakeCompletedAt
                ? `Ingevuld ${formatShortDate(new Date(profile.healthIntakeCompletedAt))}`
                : "Nog niet ingevuld"
            }
          />
        </dl>
      </section>

      {detail.memberships.length > 0 && (
        <section>
          <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text tracking-[-0.01em] mb-6">
            Abonnementen
          </h2>
          <ul className="flex flex-col divide-y divide-[color:var(--ink-500)]/60">
            {detail.memberships.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-4 py-4"
              >
                <span className="text-sm text-text">
                  {m.planType}
                  {m.planVariant ? ` · ${m.planVariant}` : ""}
                </span>
                <span className="text-xs text-text-muted">
                  {m.startDate} →{" "}
                  {m.endDate ?? m.cancellationEffectiveDate ?? "—"}
                </span>
                <span className="ml-auto text-xs uppercase tracking-[0.18em] text-text-muted">
                  {m.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-bg-elevated p-5 border border-[color:var(--ink-500)]">
      <span className="tmc-eyebrow block mb-2">{label}</span>
      <p className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-none tracking-[-0.02em] mb-1">
        {value}
      </p>
      {hint && (
        <p className="text-[11px] text-text-muted uppercase tracking-[0.14em]">
          {hint}
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="tmc-eyebrow">{label}</dt>
      <dd className="text-sm text-text leading-relaxed">{value}</dd>
    </div>
  );
}

import { AlertTriangle, Mail, Phone } from "lucide-react";
import { AvatarBubble } from "@/app/app/_shared/attendance/AvatarBubble";
import { PlanBadge } from "@/app/app/_shared/attendance/PlanBadge";
import { MembershipStatusBadge } from "../../_components/MembershipStatusBadge";
import { ActionMenu } from "./ActionMenu";
import type { MemberDetail } from "@/lib/admin/member-detail-query";

interface MemberHeaderProps {
  detail: MemberDetail;
}

export function MemberHeader({ detail }: MemberHeaderProps) {
  const { profile, primaryMembership, primaryStatus } = detail;
  const injuries = profile.healthNotes?.injuries?.trim();

  return (
    <section className="mb-10">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8 pb-8 border-b border-[color:var(--ink-500)]/60">
        <div className="flex items-center gap-5">
          <AvatarBubble
            firstName={profile.firstName}
            lastName={profile.lastName}
            avatarUrl={profile.avatarUrl}
            size={48}
          />
          <div className="min-w-0">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
              Lid
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em] mb-3">
              {profile.firstName} {profile.lastName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-text-muted">
              <a
                href={`mailto:${profile.email}`}
                className="inline-flex items-center gap-2 hover:text-accent transition-colors"
              >
                <Mail size={14} strokeWidth={1.5} aria-hidden />
                {profile.email}
              </a>
              {profile.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  className="inline-flex items-center gap-2 hover:text-accent transition-colors"
                >
                  <Phone size={14} strokeWidth={1.5} aria-hidden />
                  {profile.phone}
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <PlanBadge
                planType={primaryMembership?.planType ?? null}
                planVariant={primaryMembership?.planVariant ?? null}
              />
              <MembershipStatusBadge status={primaryStatus} />
            </div>
          </div>
        </div>

        <ActionMenu
          profileId={profile.id}
          firstName={profile.firstName}
          primaryMembership={primaryMembership}
        />
      </div>

      {injuries && (
        <aside
          role="note"
          aria-label="Blessures van dit lid"
          className="mt-6 p-5 bg-bg-elevated border border-[color:var(--warning)]/40 border-l-4 border-l-[color:var(--warning)]"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={18}
              strokeWidth={1.5}
              aria-hidden
              className="text-[color:var(--warning)] mt-0.5 shrink-0"
            />
            <div>
              <span className="tmc-eyebrow text-[color:var(--warning)] block mb-1.5">
                Blessure / let op
              </span>
              <p className="text-text text-sm leading-relaxed whitespace-pre-wrap">
                {injuries}
              </p>
            </div>
          </div>
        </aside>
      )}
    </section>
  );
}

import Link from "next/link";
import type { MemberDetail } from "@/lib/admin/member-detail-query";
import { OverviewTab } from "./OverviewTab";
import { BookingsTab } from "./BookingsTab";
import { PaymentsTab } from "./PaymentsTab";
import { HealthIntakeTab } from "./HealthIntakeTab";
import { NotesTab } from "./NotesTab";

export type MemberTab =
  | "overzicht"
  | "boekingen"
  | "facturen"
  | "health"
  | "notities";

interface MemberTabsProps {
  detail: MemberDetail;
  activeTab: MemberTab;
}

const TABS: Array<{ slug: MemberTab; label: string; count?: keyof MemberDetail }> = [
  { slug: "overzicht", label: "Overzicht" },
  { slug: "boekingen", label: "Boekingen" },
  { slug: "facturen", label: "Facturen" },
  { slug: "health", label: "Health intake" },
  { slug: "notities", label: "Notities" },
];

export function MemberTabs({ detail, activeTab }: MemberTabsProps) {
  const counts: Record<MemberTab, number | null> = {
    overzicht: null,
    boekingen: detail.upcomingBookings.length + detail.pastBookings.length,
    facturen: detail.payments.length,
    health: null,
    notities: detail.notes.length,
  };

  return (
    <>
      <nav
        aria-label="Lid tabs"
        className="flex flex-wrap items-center gap-x-8 gap-y-3 mb-10 border-b border-[color:var(--ink-500)]/60"
      >
        {TABS.map((t) => {
          const active = t.slug === activeTab;
          const count = counts[t.slug];
          return (
            <Link
              key={t.slug}
              href={`/app/admin/leden/${detail.profile.id}?tab=${t.slug}`}
              aria-current={active ? "page" : undefined}
              className={`relative pb-3 text-xs font-medium uppercase tracking-[0.18em] transition-colors duration-300 ${
                active ? "text-accent" : "text-text-muted hover:text-text"
              }`}
            >
              {t.label}
              {count != null && (
                <span className="ml-2 text-text-muted/70 tabular-nums">
                  {count}
                </span>
              )}
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 right-0 -bottom-px h-px bg-accent"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {activeTab === "overzicht" && <OverviewTab detail={detail} />}
      {activeTab === "boekingen" && <BookingsTab detail={detail} />}
      {activeTab === "facturen" && <PaymentsTab detail={detail} />}
      {activeTab === "health" && <HealthIntakeTab detail={detail} />}
      {activeTab === "notities" && <NotesTab detail={detail} />}
    </>
  );
}

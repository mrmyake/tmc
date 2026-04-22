import { AdminBookingRow } from "./AdminBookingRow";
import type { MemberDetail } from "@/lib/admin/member-detail-query";

export function BookingsTab({ detail }: { detail: MemberDetail }) {
  const { upcomingBookings, pastBookings, profile } = detail;

  return (
    <div className="flex flex-col gap-12">
      <section>
        <header className="mb-4">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
            Komend
          </span>
          <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
            {upcomingBookings.length === 0
              ? "Geen geplande sessies"
              : `${upcomingBookings.length} geplande sessie${upcomingBookings.length === 1 ? "" : "s"}`}
          </h2>
        </header>
        {upcomingBookings.length === 0 ? (
          <p className="text-text-muted text-sm">
            Er staan op dit moment geen sessies gepland voor dit lid.
          </p>
        ) : (
          <div className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {upcomingBookings.map((b) => (
              <AdminBookingRow
                key={b.id}
                profileId={profile.id}
                booking={b}
                allowOverride={false}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <header className="mb-4">
          <span className="tmc-eyebrow block mb-2">Historie</span>
          <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
            {pastBookings.length === 0
              ? "Geen historie"
              : `${pastBookings.length} boeking${pastBookings.length === 1 ? "" : "en"}`}
          </h2>
        </header>
        {pastBookings.length === 0 ? (
          <p className="text-text-muted text-sm">
            Dit lid heeft nog geen eerdere sessies.
          </p>
        ) : (
          <div className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {pastBookings.map((b) => (
              <AdminBookingRow
                key={b.id}
                profileId={profile.id}
                booking={b}
                allowOverride
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { getTrialBookingByToken } from "@/lib/actions/trial-booking";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";
import { CancelTrialBookingButton } from "./CancelTrialBookingButton";

export const metadata: Metadata = {
  title: "Proefles annuleren | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CancelTrialBookingPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const summary = await getTrialBookingByToken(token);

  if (!summary) {
    return (
      <section className="min-h-[60vh] flex items-center py-24">
        <div className="max-w-lg mx-auto text-center px-6">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            Niet gevonden
          </span>
          {/* COPY: confirm with Marlon */}
          <p className="text-text-muted">
            Deze annuleerlink is ongeldig. Neem contact op als je toch je
            proefles wilt wijzigen.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[60vh] flex items-center py-24">
      <div className="max-w-lg mx-auto text-center px-6">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          {summary.status === "cancelled" ? "Al geannuleerd" : "Proefles"}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
          {/* COPY: confirm with Marlon */}
          {summary.sessionClassName} op{" "}
          {formatWeekdayDate(new Date(summary.sessionStartAt))}
        </h1>
        <p className="text-text-muted mb-8">
          {formatTimeRange(
            new Date(summary.sessionStartAt),
            new Date(summary.sessionEndAt),
          )}
        </p>

        {summary.status === "cancelled" ? (
          <p className="text-text-muted">
            {/* COPY: confirm with Marlon */}
            Deze proefles is al geannuleerd.
          </p>
        ) : summary.canCancel ? (
          <CancelTrialBookingButton token={token} />
        ) : (
          <p className="text-text-muted text-sm">
            {/* COPY: confirm with Marlon */}
            Annuleren kan tot {summary.cancellationWindowHours} uur van
            tevoren. Neem contact op met de studio als er iets tussenkomt.
          </p>
        )}
      </div>
    </section>
  );
}

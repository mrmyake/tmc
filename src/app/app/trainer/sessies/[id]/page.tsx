import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { loadParticipants } from "@/lib/admin/attendance-actions";
import { MobileAttendanceList } from "@/app/app/_shared/attendance/MobileAttendanceList";

export const metadata = {
  title: "Trainer · Deelnemers | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TrainerSessionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  // loadParticipants autoriseert admin OR session-trainer — een trainer die
  // niet de coach van deze sessie is krijgt hier notFound.
  const res = await loadParticipants(id);
  if (!res.ok) notFound();

  return (
    <div className="px-4 sm:px-6 md:px-10 pt-6 pb-16">
      <div className="max-w-xl mx-auto mb-6">
        <Link
          href="/app/trainer/sessies"
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors"
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          Terug naar sessies
        </Link>
      </div>
      <MobileAttendanceList
        session={res.session}
        initialParticipants={res.participants}
      />
    </div>
  );
}

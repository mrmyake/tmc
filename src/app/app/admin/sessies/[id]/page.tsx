import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { loadParticipants } from "@/lib/admin/attendance-actions";
import { AttendanceList } from "@/app/app/_shared/attendance/AttendanceList";

export const metadata = {
  title: "Admin · Deelnemers | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminSessionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const res = await loadParticipants(id);
  if (!res.ok) notFound();

  return (
    <div className="px-6 md:px-10 lg:px-12 pt-10 md:pt-14">
      <Link
        href="/app/admin/rooster"
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors"
      >
        <ChevronLeft size={14} strokeWidth={1.5} />
        Terug naar rooster
      </Link>
      <AttendanceList
        session={res.session}
        initialParticipants={res.participants}
        canRefund
      />
    </div>
  );
}

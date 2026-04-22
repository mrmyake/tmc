import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { loadMemberDetail } from "@/lib/admin/member-detail-query";
import { MemberHeader } from "./_components/MemberHeader";
import { MemberTabs } from "./_components/MemberTabs";

export const metadata = {
  title: "Admin · Lid | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VALID_TABS = [
  "overzicht",
  "boekingen",
  "facturen",
  "health",
  "notities",
] as const;
type Tab = (typeof VALID_TABS)[number];

export default async function MemberDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await props.params;
  const { tab: tabParam } = await props.searchParams;
  const tab: Tab = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as Tab)
    : "overzicht";

  const detail = await loadMemberDetail(id);
  if (!detail) notFound();

  return (
    <div className="px-6 md:px-10 lg:px-12 pt-8 pb-14">
      <Link
        href="/app/admin/leden"
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors mb-6"
      >
        <ChevronLeft size={14} strokeWidth={1.5} />
        Terug naar leden
      </Link>

      <MemberHeader detail={detail} />

      <MemberTabs detail={detail} activeTab={tab} />
    </div>
  );
}

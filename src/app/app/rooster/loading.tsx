import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function RoosterLoading() {
  return <PageSkeleton eyebrow="Week rooster" title="Deze week." rows={8} />;
}

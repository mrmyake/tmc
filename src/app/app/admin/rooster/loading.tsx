import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function AdminRoosterLoading() {
  return (
    <PageSkeleton eyebrow="Admin cockpit" title="Rooster." rows={7} />
  );
}

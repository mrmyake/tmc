import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function ProefcodesLoading() {
  return (
    <PageSkeleton eyebrow="Admin cockpit" title="Proefcodes." rows={6} />
  );
}

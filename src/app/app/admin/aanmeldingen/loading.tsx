import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function AanmeldingenLoading() {
  return (
    <PageSkeleton eyebrow="Admin cockpit" title="Aanmeldingen." rows={6} />
  );
}

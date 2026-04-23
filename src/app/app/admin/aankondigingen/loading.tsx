import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function AankondigingenLoading() {
  return (
    <PageSkeleton
      eyebrow="Admin cockpit"
      title="Aankondigingen."
      rows={4}
    />
  );
}

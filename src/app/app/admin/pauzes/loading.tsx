import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function PauzesLoading() {
  return (
    <PageSkeleton
      eyebrow="Admin cockpit"
      title="Pauze-verzoeken."
      rows={4}
    />
  );
}

import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function TrainerSessiesLoading() {
  return (
    <PageSkeleton
      eyebrow="Mijn sessies"
      title="Komende 4 weken."
      rows={6}
    />
  );
}

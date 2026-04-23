import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function TrainerLoading() {
  return (
    <PageSkeleton
      eyebrow="Trainer"
      title="Vandaag."
      rows={3}
      variant="card"
    />
  );
}

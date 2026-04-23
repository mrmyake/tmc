import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function TrainerUrenLoading() {
  return (
    <PageSkeleton
      eyebrow="Urenregistratie"
      title="Uren indienen."
      rows={4}
    />
  );
}

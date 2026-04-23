import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function TrainerSessieLoading() {
  return <PageSkeleton eyebrow="Deelnemers" title="Laden..." rows={5} />;
}

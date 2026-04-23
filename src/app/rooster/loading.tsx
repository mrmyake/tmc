import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function PublicRoosterLoading() {
  return (
    <PageSkeleton
      eyebrow="Het rooster"
      title="Twee weken vooruit."
      rows={10}
    />
  );
}

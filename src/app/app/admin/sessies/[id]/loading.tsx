import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function AdminSessieLoading() {
  return (
    <PageSkeleton eyebrow="Deelnemers" title="Laden..." rows={6} />
  );
}

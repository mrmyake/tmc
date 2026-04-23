import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function AdminDashboardLoading() {
  return (
    <PageSkeleton
      eyebrow="Admin cockpit"
      title="Dashboard."
      rows={4}
      variant="card"
    />
  );
}

import { PageSkeleton } from "./_components/PageSkeleton";

export default function AppDashboardLoading() {
  return (
    <PageSkeleton
      eyebrow="Welkom terug"
      title="Overzicht."
      rows={4}
      variant="card"
    />
  );
}

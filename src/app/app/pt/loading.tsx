import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function PtLoading() {
  return (
    <PageSkeleton
      eyebrow="Personal training"
      title="Persoonlijk ingepland."
      rows={2}
    />
  );
}

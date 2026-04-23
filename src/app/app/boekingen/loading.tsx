import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function BoekingenLoading() {
  return <PageSkeleton eyebrow="Jouw sessies" title="Boekingen." rows={5} />;
}

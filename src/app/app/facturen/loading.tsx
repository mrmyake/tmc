import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function FacturenLoading() {
  return <PageSkeleton eyebrow="Betalingen" title="Facturen." rows={6} />;
}

import { PageSkeleton } from "@/app/app/_components/PageSkeleton";

export default function ProeflessenLoading() {
  return (
    <PageSkeleton eyebrow="Admin cockpit" title="Proeflessen." rows={6} />
  );
}

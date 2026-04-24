import { Container } from "@/components/layout/Container";

export default function VrijTrainenLoading() {
  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <div aria-hidden className="mb-12">
        <div className="h-3 w-24 bg-bg-elevated mb-5" />
        <div className="h-14 w-80 max-w-full bg-bg-elevated mb-6" />
        <div className="h-4 w-full max-w-md bg-bg-elevated" />
      </div>
      <div aria-hidden className="flex flex-wrap gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="min-w-[96px] h-16 bg-bg-elevated animate-pulse"
          />
        ))}
      </div>
    </Container>
  );
}

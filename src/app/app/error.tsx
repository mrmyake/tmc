"use client";

import { useEffect } from "react";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/app error boundary]", error);
  }, [error]);

  return (
    <Container className="py-24 md:py-32 max-w-xl">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
        Er ging iets mis
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-[1.05] tracking-[-0.02em] mb-6">
        We konden dit niet laden.
      </h1>
      <p className="text-text-muted text-base leading-relaxed mb-10">
        Probeer het zo nog eens. Blijft het hangen, laat het Marlon even
        weten. We kijken er naar.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Probeer opnieuw</Button>
        <Button href="/app" variant="secondary">
          Terug naar dashboard
        </Button>
      </div>
    </Container>
  );
}

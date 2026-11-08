"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { resolveAttribution, withAttribution } from "@/lib/attribution/params";

const INTAKE = "/12-weken-programma/intake";

function Cta() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  // Campagneparameters uit de URL van deze pagina, zonder opslag
  // (spec-marketing-attribution.md). De layout kent searchParams niet, vandaar
  // deze kleine client-wrapper.
  const href = withAttribution(INTAKE, resolveAttribution(searchParams, pathname));
  return (
    <Button href={href} variant="primary" className="hidden md:inline-flex">
      {/* COPY: confirm met Marlon */}
      Plan je gratis intake
    </Button>
  );
}

export function ProgrammaTopbarCta() {
  return (
    <Suspense
      fallback={
        <Button href={INTAKE} variant="primary" className="hidden md:inline-flex">
          {/* COPY: confirm met Marlon */}
          Plan je gratis intake
        </Button>
      }
    >
      <Cta />
    </Suspense>
  );
}

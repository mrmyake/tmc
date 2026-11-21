"use client";

import { useSelectedLayoutSegment } from "next/navigation";

/**
 * De site-brede JSON-LD van TMC (LocalBusiness en WebSite) uit de root layout.
 * Op de standalone hormoonprofiel-schil (/hp-site, via een rewrite vanaf
 * hormoonprofiel.com) hoort die niet: daar verwijst de pagina-JSON-LD naar de
 * bestaande #business-entiteit, en WebSite is die van hormoonprofiel.com.
 * Het geselecteerde segment volgt de echte route; usePathname geeft bij een
 * rewrite het browserpad.
 */
export function GlobalJsonLd({ data }: { data: object[] }) {
  const segment = useSelectedLayoutSegment();
  if (segment === "hp-site") return null;
  return (
    <>
      {data.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}

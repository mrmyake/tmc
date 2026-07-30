"use client";

/**
 * Vuurt bewust geen `trackContact` meer. De enige mount van deze component
 * zit op `/app/support`, dus achter de meetgrens — daar hoort geen GA4-event
 * te vuren (zie de header van `src/lib/analytics.ts`).
 *
 * De component blijft staan als vehikel voor de publieke footer-`tel:`/
 * `mailto:`-links (audit gap #4). Zet bij die mount de
 * `onClick={() => trackContact(method)}` terug: dáár is het event wél op zijn
 * plek, want dat is acquisitie.
 */

interface TrackedContactLinkProps {
  method: "phone" | "whatsapp" | "email";
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function TrackedContactLink({
  method,
  href,
  children,
  className,
}: TrackedContactLinkProps) {
  return (
    <a
      href={href}
      className={className}
      {...(method === "whatsapp"
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {children}
    </a>
  );
}

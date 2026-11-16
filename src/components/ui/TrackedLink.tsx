"use client";

import { trackContactClick, type ContactMethod } from "@/lib/analytics";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";

/**
 * De enige plek die het GA4-event `contact_click` vuurt
 * (spec-conversiemeting.md): elke publieke tel:-, mailto:- of wa.me-link
 * gaat via deze component, ook links uit Sanity-content
 * (`portableTextComponents`). Het event hangt aan de klik zelf.
 *
 * De component staat ook op `/app/support`, achter de meetgrens. Daar is het
 * event een stille no-op, want `ga-disable` staat op productroutes aan
 * (`trackEvent` in `src/lib/analytics.ts`).
 *
 * appearance kiest alleen de vormgeving: "plain" is een kale <a> met de
 * meegegeven className, "quiet" de QuietLink en "button" de secundaire knop.
 */

interface TrackedContactLinkProps {
  method: ContactMethod;
  href: string;
  children: React.ReactNode;
  className?: string;
  appearance?: "plain" | "quiet" | "button";
}

export function TrackedContactLink({
  method,
  href,
  children,
  className,
  appearance = "plain",
}: TrackedContactLinkProps) {
  const onClick = () => trackContactClick(method);

  if (appearance === "quiet") {
    return (
      <QuietLink href={href} className={className} onClick={onClick}>
        {children}
      </QuietLink>
    );
  }

  if (appearance === "button") {
    return (
      <Button href={href} variant="secondary" className={className} onClick={onClick}>
        {children}
      </Button>
    );
  }

  return (
    <a
      href={href}
      className={className}
      onClick={onClick}
      {...(method === "whatsapp"
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {children}
    </a>
  );
}

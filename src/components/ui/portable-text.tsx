import type { PortableTextComponents } from "@portabletext/react";
import { TrackedContactLink } from "@/components/ui/TrackedLink";
import { contactMethodFromHref } from "@/lib/contact-links";

/**
 * Gedeelde componenten voor elke Portable Text-renderer op de publieke site.
 * Alleen de link-mark wijkt af van de standaard: een tel:-, mailto:- of
 * WhatsApp-link uit Sanity-content gaat via TrackedContactLink en vuurt dus
 * `contact_click` (spec-conversiemeting.md). Elke andere link rendert zoals
 * de standaard van @portabletext/react.
 */
export const portableTextComponents: PortableTextComponents = {
  marks: {
    link: ({ value, children }) => {
      const href = typeof value?.href === "string" ? value.href : undefined;
      const method = contactMethodFromHref(href);
      if (href && method) {
        return (
          <TrackedContactLink method={method} href={href}>
            {children}
          </TrackedContactLink>
        );
      }
      return <a href={href}>{children}</a>;
    },
  },
};

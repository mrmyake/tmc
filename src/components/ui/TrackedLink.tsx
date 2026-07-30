"use client";

import { trackContact } from "@/lib/analytics";

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
      onClick={() => trackContact(method)}
      className={className}
      {...(method === "whatsapp"
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      {children}
    </a>
  );
}

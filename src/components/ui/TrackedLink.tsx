"use client";

import { trackContact, trackCTA } from "@/lib/analytics";
import { usePathname } from "next/navigation";

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

interface TrackedCTAProps {
  label: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function TrackedCTA({
  label,
  href,
  children,
  className,
}: TrackedCTAProps) {
  const pathname = usePathname();
  return (
    <a
      href={href}
      onClick={() => trackCTA(label, pathname)}
      className={className}
    >
      {children}
    </a>
  );
}

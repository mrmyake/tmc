"use client";

import { openCookieSettings } from "@/lib/consent";

/**
 * Heropent de cookiebanner met de huidige keuze per categorie voorgevuld
 * (spec-conversiemeting.md). Een gewone knop: er hangt bewust geen tracking
 * aan. Werkt overal waar CookieConsent gemount is (SiteShell en de layout
 * van /12-weken-programma).
 */
export function CookieSettingsButton({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={openCookieSettings}
      className={`text-sm text-text-muted underline-offset-4 transition-colors duration-300 hover:text-text hover:underline cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}

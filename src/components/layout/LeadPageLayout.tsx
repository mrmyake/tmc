import Link from "next/link";
import { SITE } from "@/lib/constants";

export function LeadPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Minimal nav — logo + back link */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-bg/90 backdrop-blur-md border-b border-bg-subtle">
        <nav className="mx-auto max-w-7xl px-6 lg:px-8 flex items-center justify-between h-16">
          <Link
            href="/"
            className="font-[family-name:var(--font-playfair)] text-lg text-text tracking-wide"
          >
            {SITE.name}
          </Link>
          <Link
            href="/"
            className="text-sm text-text-muted hover:text-text transition-colors"
          >
            ← Terug naar home
          </Link>
        </nav>
      </header>
      <main className="pt-16">{children}</main>
    </div>
  );
}

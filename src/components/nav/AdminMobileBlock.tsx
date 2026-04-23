import Link from "next/link";
import { Monitor } from "lucide-react";

/**
 * Op viewports <lg tonen we geen admin-interface — Marlon doet admin
 * op desktop. Deze component wordt boven de admin-content gerenderd
 * en is zichtbaar t/m lg:, dan verdwijnt 'ie met lg:hidden.
 */
export function AdminMobileBlock() {
  return (
    <section
      aria-labelledby="admin-mobile-block-title"
      className="lg:hidden min-h-[80vh] flex items-center justify-center px-8 py-16"
    >
      <div className="max-w-md text-center">
        <Monitor
          size={28}
          strokeWidth={1.5}
          aria-hidden
          className="mx-auto text-accent mb-6"
        />
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          Desktop vereist
        </span>
        <h1
          id="admin-mobile-block-title"
          className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-[1.05] tracking-[-0.02em] mb-4"
        >
          Admin cockpit is alleen beschikbaar op desktop.
        </h1>
        <p className="text-text-muted text-sm leading-relaxed mb-8">
          Open op een laptop of desktop om verder te gaan.
        </p>
        <Link
          href="/app/rooster"
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text hover:border-accent hover:text-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
        >
          Naar rooster
        </Link>
      </div>
    </section>
  );
}

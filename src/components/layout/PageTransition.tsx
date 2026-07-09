"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Cross-route fade. The `key` on the wrapper swaps on every pathname
 * change, which forces React to remount the div and restart the
 * `.tmc-page-fade` CSS animation defined in globals.css. No
 * framer-motion dependency — the previous implementation dragged the
 * whole motion runtime into the critical bundle for every route.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // De remount hierboven (key={pathname}) wint een race met de browser's
  // eigen hash-scroll: de target-node bestaat soms nog niet, of de remount
  // reset scrollY vlak nadat de browser er al naartoe gescrolld is. Zonder
  // dit effect landen cross-page anchors (bijv. /aanbod#all-access vanuit
  // de Aanbod-hub, of /prijzen#groepslessen) altijd bovenaan de pagina i.p.v.
  // bij de sectie. `scrollIntoView()` zonder expliciete `behavior` respecteert
  // de CSS `scroll-behavior` (incl. de reduced-motion override in globals.css).
  useEffect(() => {
    if (!window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    el?.scrollIntoView();
  }, [pathname]);

  return (
    <div key={pathname} className="tmc-page-fade">
      {children}
    </div>
  );
}

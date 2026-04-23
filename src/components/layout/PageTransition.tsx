"use client";

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
  return (
    <div key={pathname} className="tmc-page-fade">
      {children}
    </div>
  );
}

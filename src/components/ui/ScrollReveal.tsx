"use client";

import { useEffect, useRef, useState } from "react";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Delay in seconds before the reveal transition runs. */
  delay?: number;
}

/**
 * CSS-only scroll reveal. Uses a native IntersectionObserver to flip a
 * data-attribute that triggers the transition defined in globals.css
 * (.tmc-scroll-reveal). No framer-motion import → keeps that ~24 KiB
 * out of the critical bundle for every page that uses this helper.
 *
 * API matches the previous framer-motion implementation so existing
 * callers don't need touching.
 */
export function ScrollReveal({
  children,
  className = "",
  delay = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // If IntersectionObserver isn't available (ancient browsers),
    // reveal immediately — matches the JS-off fallback in CSS.
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "-100px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-revealed={revealed || undefined}
      style={delay > 0 ? { transitionDelay: `${delay}s` } : undefined}
      className={`tmc-scroll-reveal ${className}`}
    >
      {children}
    </div>
  );
}

import type * as React from "react";
import localFont from "next/font/local";

/**
 * Site-fonts via next/font/local uit src/fonts (statische WOFF, SIL OFL, zie
 * src/fonts/README.md). Geen netwerkcall naar Google tijdens de build; dat
 * was de vermoedelijke bron van de intermitterende Vercel-buildfout op next/font/google.
 *
 * Gewichten, CSS-variabelen en display: "swap" zijn gelijk aan de vorige
 * next/font/google-config. Per lettertype twee loads, latin en latin-ext,
 * elk met een unicode-range (next/font/local kent die alleen op loadniveau),
 * zodat de browser per teken het juiste bestand pakt, zoals bij Google. Alleen
 * latin wordt gepreload. next/font/local eist letterlijke waarden in de
 * aanroep, vandaar de herhaling.
 */

// Fraunces wordt in de layouts alleen in 400 + 500 gebruikt (geen axes);
// Inter in 400/500/600; de kiosk heeft Fraunces 300 + 400 nodig.
const frauncesLatin = localFont({
  src: [
    { path: "../fonts/fraunces-latin-400-normal.woff", weight: "400", style: "normal" },
    { path: "../fonts/fraunces-latin-500-normal.woff", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: true,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

const frauncesExt = localFont({
  src: [
    { path: "../fonts/fraunces-latin-ext-400-normal.woff", weight: "400", style: "normal" },
    { path: "../fonts/fraunces-latin-ext-500-normal.woff", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

const interLatin = localFont({
  src: [
    { path: "../fonts/inter-latin-400-normal.woff", weight: "400", style: "normal" },
    { path: "../fonts/inter-latin-500-normal.woff", weight: "500", style: "normal" },
    { path: "../fonts/inter-latin-600-normal.woff", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: true,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

const interExt = localFont({
  src: [
    { path: "../fonts/inter-latin-ext-400-normal.woff", weight: "400", style: "normal" },
    { path: "../fonts/inter-latin-ext-500-normal.woff", weight: "500", style: "normal" },
    { path: "../fonts/inter-latin-ext-600-normal.woff", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

const kioskSerifLatin = localFont({
  src: [
    { path: "../fonts/fraunces-latin-300-normal.woff", weight: "300", style: "normal" },
    { path: "../fonts/fraunces-latin-400-normal.woff", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: true,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

const kioskSerifExt = localFont({
  src: [
    { path: "../fonts/fraunces-latin-ext-300-normal.woff", weight: "300", style: "normal" },
    { path: "../fonts/fraunces-latin-ext-400-normal.woff", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

const list = (a: { style: { fontFamily: string } }, b: { style: { fontFamily: string } }) =>
  `${a.style.fontFamily}, ${b.style.fontFamily}`;

/** Inline CSS-variabelen voor <html>: zelfde namen als voorheen. */
export const siteFontVars = {
  "--font-playfair": list(frauncesLatin, frauncesExt),
  "--font-dm-sans": list(interLatin, interExt),
} as React.CSSProperties;

/** Inline CSS-variabele voor de kiosk (Fraunces 300 + 400). */
export const kioskFontVars = {
  "--font-kiosk-serif": list(kioskSerifLatin, kioskSerifExt),
} as React.CSSProperties;

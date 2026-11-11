# Lettertypen

Eén gedeelde map voor alle fonts van de site en de factuur-PDF. Statische WOFF
(geen variabele fonts, één bestand per gewicht) uit `@fontsource/fraunces` en
`@fontsource/inter` 5.3.0, beide SIL Open Font License 1.1 (licenties in deze
map). Per gewicht een `latin`- en een `latin-ext`-bestand.

- Fraunces 300, 400, 500; Inter 400, 500, 600.
- `src/lib/fonts.ts`: `next/font/local` voor de root-layout en de kiosk. Geen
  afhankelijkheid van Google Fonts tijdens de build.
- `src/pdfs/CustomerInvoicePdf.tsx`: react-pdf leest dezelfde bestanden van
  schijf, met latin-ext als fallback-familie (react-pdf kent geen unicode-range).
  `outputFileTracingIncludes` in `next.config.ts` neemt de map mee.
- react-pdf leest geen woff2 en geen variabele fonts, vandaar deze vorm.

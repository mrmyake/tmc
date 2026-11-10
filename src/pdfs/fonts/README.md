# Lettertypen voor de factuur-PDF

Statische WOFF-bestanden (latin-subset) uit `@fontsource/fraunces` en
`@fontsource/inter` 5.3.0, beide SIL Open Font License 1.1. Ze worden door
`CustomerInvoicePdf.tsx` via `Font.register` van schijf gelezen;
`outputFileTracingIncludes` in `next.config.ts` neemt ze mee in de bundel.
react-pdf leest geen woff2 en geen variabele fonts, vandaar deze vorm.

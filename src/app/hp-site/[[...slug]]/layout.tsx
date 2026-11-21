// Doorgeefluik: geeft de catch-all een eigen segment-layout, zodat de
// not-found.tsx hiernaast (de eigen 404 in de hormoonprofiel-stijl) de
// notFound() van de pagina opvangt in plaats van de globale 404 van TMC.
export default function HpSlugLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

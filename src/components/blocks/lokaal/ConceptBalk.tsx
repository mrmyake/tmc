import type { PaginaStatus } from "@/content/lokaal";

/**
 * Vaste smalle balk bovenaan een conceptpagina. Een conceptpagina rendert
 * alleen buiten productie (in productie geeft hij een 307, zie gate.ts), dus
 * de balk verschijnt daar nooit. Bij 'live' rendert de balk niets.
 */
export function ConceptBalk({ status }: { status: PaginaStatus }) {
  if (status !== "concept") return null;
  return (
    <>
      {/* De navbar is fixed top-0; schuif hem onder de balk zodat hij niet overlapt. */}
      <style>{"header.fixed.top-0{top:1.75rem}"}</style>
      <div
        role="note"
        data-concept-balk
        className="fixed inset-x-0 top-0 z-[100] flex h-7 items-center justify-center bg-warning px-4 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-900"
      >
        {/* COPY: confirm met Marlon */}
        Concept, niet live
      </div>
    </>
  );
}

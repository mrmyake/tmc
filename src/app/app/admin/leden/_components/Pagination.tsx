import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  params: Record<string, string>;
}

function buildHref(page: number, params: Record<string, string>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `/app/admin/leden?${s}` : "/app/admin/leden";
}

export function Pagination({
  currentPage,
  totalPages,
  params,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const prev = Math.max(1, currentPage - 1);
  const next = Math.min(totalPages, currentPage + 1);

  return (
    <nav
      aria-label="Paginatie"
      className="mt-8 flex items-center justify-between gap-4"
    >
      <span className="tmc-eyebrow">
        Pagina {currentPage} van {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(prev, params)}
          aria-disabled={currentPage === 1}
          aria-label="Vorige pagina"
          className={`inline-flex items-center gap-2 px-4 py-2.5 border border-text-muted/30 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-300 ${
            currentPage === 1
              ? "pointer-events-none opacity-40 text-text-muted"
              : "text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          Vorige
        </Link>
        <Link
          href={buildHref(next, params)}
          aria-disabled={currentPage === totalPages}
          aria-label="Volgende pagina"
          className={`inline-flex items-center gap-2 px-4 py-2.5 border border-text-muted/30 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-300 ${
            currentPage === totalPages
              ? "pointer-events-none opacity-40 text-text-muted"
              : "text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          Volgende
          <ChevronRight size={14} strokeWidth={1.5} />
        </Link>
      </div>
    </nav>
  );
}

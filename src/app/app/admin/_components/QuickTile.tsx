import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface QuickTileProps {
  label: string;
  count: number;
  href: string;
  hint?: string;
}

export function QuickTile({ label, count, href, hint }: QuickTileProps) {
  return (
    <Link
      href={href}
      className="group relative bg-bg-elevated p-6 flex items-center justify-between gap-4 border border-transparent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent/40"
    >
      <div className="flex flex-col gap-2 min-w-0">
        <span className="tmc-eyebrow">{label}</span>
        <p className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none tracking-[-0.02em]">
          {count}
        </p>
        {hint && <p className="text-text-muted text-xs">{hint}</p>}
      </div>
      <ArrowUpRight
        size={18}
        strokeWidth={1.5}
        className="text-text-muted transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
        aria-hidden
      />
    </Link>
  );
}

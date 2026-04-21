import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface QuietLinkProps {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  active?: boolean;
  className?: string;
  ariaCurrent?: "page";
  ariaLabel?: string;
}

export function QuietLink({
  href,
  children,
  external,
  active,
  className = "",
  ariaCurrent,
  ariaLabel,
}: QuietLinkProps) {
  const color = active ? "text-text" : "text-text-muted";
  const underlineState = active
    ? "scale-x-100"
    : "scale-x-0 group-hover:scale-x-100";

  const classes = `group relative inline-flex items-center gap-1.5 text-sm transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${color} ${className}`;

  const content = (
    <>
      <span className="relative">
        {children}
        <span
          aria-hidden
          className={`pointer-events-none absolute left-0 right-0 -bottom-0.5 h-px origin-left bg-accent transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${underlineState}`}
        />
      </span>
      {external && (
        <ArrowUpRight
          size={14}
          strokeWidth={1.5}
          className="transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      )}
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={classes}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={href}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      className={classes}
    >
      {content}
    </Link>
  );
}

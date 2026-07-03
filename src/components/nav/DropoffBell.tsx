import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { countOpenDropoffFlags } from "@/lib/admin/dropoff-query";

/**
 * Bell-icoon in de admin header, zelfde patroon als PauzeRequestBell.
 * Toont het aantal actieve leden dat de flag-dropoff-cron heeft
 * gevlagd (14+ dagen geen bezoek) en nog niet zijn teruggekomen. Klik
 * gaat naar /app/admin/dropoff.
 *
 * Server-component, dus telt fresh per request.
 */
export async function DropoffBell() {
  const open = await countOpenDropoffFlags();

  return (
    <Link
      href="/app/admin/dropoff"
      aria-label={
        open === 0
          ? "Geen leden gevlagd voor dropoff"
          : `${open} leden mogelijk afgehaakt`
      }
      className="relative inline-flex items-center justify-center w-10 h-10 text-text-muted hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
    >
      <TrendingDown size={18} strokeWidth={1.5} aria-hidden />
      {open > 0 && (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[10px] font-medium text-bg bg-accent leading-none"
        >
          {open > 9 ? "9+" : open}
        </span>
      )}
    </Link>
  );
}

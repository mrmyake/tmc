import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/**
 * Bell-icoon in de admin header. Query de huidige open pauze-requests
 * en toont een klein accent-dot + count als er iets openstaat. Klik
 * gaat naar /app/admin/pauzes (waar Marlon ze goed/afkeurt).
 *
 * Server-component, dus telt fresh per request. Goedkoop — één count-
 * query met head:true.
 */
export async function PauzeRequestBell() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("membership_pauses")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    console.error("[PauzeRequestBell] count failed", error.message);
  }

  const open = count ?? 0;

  return (
    <Link
      href="/app/admin/pauzes"
      aria-label={
        open === 0
          ? "Geen open pauze-verzoeken"
          : `${open} open pauze-verzoeken`
      }
      className="relative inline-flex items-center justify-center w-10 h-10 text-text-muted hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
    >
      <Bell size={18} strokeWidth={1.5} aria-hidden />
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

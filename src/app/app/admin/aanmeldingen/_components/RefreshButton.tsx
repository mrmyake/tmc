"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshEmailSignups } from "@/lib/admin/email-signups-actions";

/** Gooit de MailerLite-cache weg via de server action en herlaadt de pagina. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    setMessage(null);
    startTransition(async () => {
      const res = await refreshEmailSignups();
      setMessage(res.message);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-xs text-text-muted">{message}</span>}
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="inline-flex items-center gap-2 border border-[color:var(--ink-500)] text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted px-4 py-2.5 hover:text-accent hover:border-accent transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default"
      >
        <RefreshCw
          size={12}
          strokeWidth={1.5}
          aria-hidden
          className={pending ? "animate-spin" : undefined}
        />
        {/* COPY: confirm met Marlon */}
        {pending ? "Bezig" : "Verversen"}
      </button>
    </div>
  );
}

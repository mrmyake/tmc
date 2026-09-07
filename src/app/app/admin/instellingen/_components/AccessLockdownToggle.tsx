"use client";

import { useState, useTransition } from "react";
import { setAccessLockdown } from "@/lib/access/lockdown-actions";

interface Props {
  lockdown: boolean;
  akilesConfigured: boolean;
}

/**
 * Noodrem voor de deurtoegang. Twee stappen: eerst de knop, dan een
 * expliciete bevestiging, zodat een misklik de studio niet op slot zet
 * (of open). De huidige toestand is altijd zichtbaar.
 */
export function AccessLockdownToggle({ lockdown, akilesConfigured }: Props) {
  const [current, setCurrent] = useState(lockdown);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  function apply() {
    setMessage(null);
    startTransition(async () => {
      const res = await setAccessLockdown(!current);
      setConfirming(false);
      if (res.ok) {
        setCurrent(res.lockdown);
        setMessage({ tone: "success", text: res.message });
      } else {
        setMessage({ tone: "error", text: res.message });
      }
    });
  }

  const primaryButton =
    "inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] active:scale-[0.99] disabled:opacity-50 cursor-pointer";
  const ghostButton =
    "inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-[color:var(--ink-500)] text-text-muted hover:text-text transition-colors duration-300 disabled:opacity-50 cursor-pointer";

  return (
    <section
      aria-labelledby="access-lockdown-title"
      className="border-t border-[color:var(--ink-500)]/60 pt-10"
    >
      <div className="mb-6">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {/* COPY: confirm met Marlon */}
          Deurtoegang
        </span>
        <h2
          id="access-lockdown-title"
          className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.05] tracking-[-0.02em]"
        >
          {/* COPY: confirm met Marlon */}
          Noodrem
        </h2>
        <p className="mt-3 text-text-muted text-sm max-w-md">
          {/* COPY: confirm met Marlon */}
          Zet de deur voor alle leden dicht, ongeacht hun abonnement. Staf
          houdt toegang. Opheffen zet ieders eigen schema weer aan.
        </p>
      </div>

      <div className="max-w-sm flex flex-col gap-5">
        <p
          role="status"
          className={`inline-flex items-center gap-2 self-start px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] border ${
            current
              ? "border-[color:var(--danger)] text-[color:var(--danger)]"
              : "border-[color:var(--ink-500)] text-text-muted"
          }`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              current ? "bg-[color:var(--danger)]" : "bg-accent"
            }`}
          />
          {/* COPY: confirm met Marlon */}
          {current ? "Noodrem actief" : "Normale toegang"}
        </p>

        {!akilesConfigured && (
          <p className="text-text-muted text-xs">
            {/* COPY: confirm met Marlon */}
            Akiles is nog niet gekoppeld. De keuze wordt opgeslagen en geldt
            zodra de koppeling actief is.
          </p>
        )}

        {!confirming ? (
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setConfirming(true);
            }}
            disabled={pending}
            className={`self-start ${primaryButton} ${
              current
                ? "bg-accent text-bg border-accent hover:bg-accent-hover hover:border-accent-hover"
                : "bg-transparent text-[color:var(--danger)] border-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
            }`}
          >
            {/* COPY: confirm met Marlon */}
            {current ? "Noodrem opheffen" : "Noodrem activeren"}
          </button>
        ) : (
          <div className="flex flex-col gap-4 border border-[color:var(--ink-500)] p-5">
            <p className="text-text text-sm">
              {/* COPY: confirm met Marlon */}
              {current
                ? "Weet je zeker dat je de noodrem opheft? Leden kunnen daarna weer naar binnen volgens hun schema."
                : "Weet je zeker dat je de noodrem activeert? Geen enkel lid kan de deur dan nog openen, ook niet met verlengde toegang."}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={apply}
                disabled={pending}
                className={`${primaryButton} ${
                  current
                    ? "bg-accent text-bg border-accent hover:bg-accent-hover hover:border-accent-hover"
                    : "bg-[color:var(--danger)] text-bg border-[color:var(--danger)]"
                }`}
              >
                {/* COPY: confirm met Marlon */}
                {pending ? "Bezig" : current ? "Ja, opheffen" : "Ja, activeren"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className={ghostButton}
              >
                {/* COPY: confirm met Marlon */}
                Annuleren
              </button>
            </div>
          </div>
        )}

        {message && (
          <p
            role={message.tone === "success" ? "status" : "alert"}
            className={`text-sm ${
              message.tone === "success"
                ? "text-[color:var(--success)]"
                : "text-[color:var(--danger)]"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setAdminCheckinPin } from "@/lib/admin/checkin-pin-actions";

interface Props {
  /** True als er al een PIN is ingesteld. */
  isSet: boolean;
}

export function CheckinPinForm({ isSet }: Props) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (pin !== confirm) {
      setMessage({ tone: "error", text: "PIN's komen niet overeen." });
      return;
    }
    if (!/^[0-9]{4,6}$/.test(pin)) {
      setMessage({ tone: "error", text: "PIN is 4-6 cijfers." });
      return;
    }
    startTransition(async () => {
      const res = await setAdminCheckinPin(pin);
      if (res.ok) {
        setMessage({ tone: "success", text: "PIN opgeslagen." });
        setPin("");
        setConfirm("");
      } else {
        setMessage({ tone: "error", text: res.message });
      }
    });
  }

  const input =
    "w-full bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-text text-base sm:text-sm focus:outline-none focus:border-accent";

  return (
    <section
      aria-labelledby="pin-form-title"
      className="border-t border-[color:var(--ink-500)]/60 pt-10"
    >
      <div className="mb-6">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          Check-in tablet
        </span>
        <h2
          id="pin-form-title"
          className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.05] tracking-[-0.02em]"
        >
          Admin-PIN voor kiosk-tablet
        </h2>
        <p className="mt-3 text-text-muted text-sm max-w-md">
          Gedeelde PIN voor het team om admin-modus op de studio-tablet
          te ontgrendelen. 4-6 cijfers. {isSet ? "Er is al een PIN ingesteld — invullen overschrijft de huidige." : "Er is nog geen PIN ingesteld; tablet admin-modus is nu onbereikbaar."}
        </p>
      </div>
      <form onSubmit={submit} className="max-w-sm flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="tmc-eyebrow">Nieuwe PIN</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            maxLength={6}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="tmc-eyebrow">Herhaal</span>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            maxLength={6}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/[^0-9]/g, ""))}
            className={input}
          />
        </label>
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
        <button
          type="submit"
          disabled={pending || pin.length < 4}
          className="self-start inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        >
          {pending ? "Bezig" : isSet ? "Vervangen" : "Instellen"}
        </button>
      </form>
    </section>
  );
}

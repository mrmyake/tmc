"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { getStoredUtm } from "@/lib/utm";

// text-base (16px) is intentional — anything smaller triggers Safari
// mobile's auto-zoom on focus, which shifts the login card outside the
// viewport. 16px is the minimum threshold that keeps zoom disabled.
const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

interface Props {
  initialError?: string;
}

export function LoginForm({ initialError }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    initialError ? "error" : "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string>(
    initialError ?? ""
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    const supabase = createClient();
    // Attribution meegeven bij eerste signup — de trigger
    // handle_new_auth_user leest raw_user_meta_data en kopieert naar
    // profiles. Bestaande users behouden hun originele attribution
    // (trigger doet ON CONFLICT DO NOTHING).
    const utm = getStoredUtm();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          acquisition_source: utm.utm_source,
          acquisition_medium: utm.utm_medium,
          acquisition_campaign: utm.utm_campaign,
          acquisition_content: utm.utm_content,
          signup_path: window.location.pathname,
          first_touch_at: new Date().toISOString(),
        },
      },
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message || "Er ging iets mis. Probeer het opnieuw.");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="bg-bg-elevated border border-accent/30 p-8 text-center">
        <div className="text-accent text-xs font-medium uppercase tracking-[0.25em] mb-3">
          Check je mail
        </div>
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-3">
          We hebben je een link gestuurd
        </h2>
        <p className="text-text-muted text-sm leading-relaxed">
          Open de mail naar <span className="text-text">{email}</span> en klik op
          de inloglink. De link is 1 uur geldig en kan maar één keer gebruikt
          worden.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setEmail("");
          }}
          className="mt-6 text-xs text-text-muted hover:text-accent uppercase tracking-[0.2em] cursor-pointer"
        >
          Ander e-mailadres gebruiken
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="email"
          className="block text-xs uppercase tracking-[0.2em] text-text-muted mb-2"
        >
          E-mailadres
        </label>
        <input
          id="email"
          type="email"
          name="email"
          required
          autoFocus
          placeholder="naam@voorbeeld.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputStyles}
        />
      </div>

      {status === "error" && errorMsg && (
        <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
          {errorMsg}
        </div>
      )}

      <Button
        type="submit"
        className={`w-full ${status === "sending" ? "opacity-50 pointer-events-none" : ""}`}
      >
        {status === "sending" ? "Bezig..." : "Stuur inloglink"}
      </Button>

      <p className="text-xs text-text-muted leading-relaxed text-center">
        Geen wachtwoord nodig. Je ontvangt een eenmalige inloglink per mail.
      </p>
    </form>
  );
}

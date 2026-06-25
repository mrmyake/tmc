"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { loginAction, type LoginState } from "@/lib/actions/auth";

// text-base (16px) is intentional — anything smaller triggers Safari mobile's
// auto-zoom on focus, which shifts the login card outside the viewport.
const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

interface Props {
  initialError?: string;
}

export function LoginForm({ initialError }: Props) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    { error: initialError ?? null }
  );

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-5">
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
            autoComplete="username"
            placeholder="naam@voorbeeld.nl"
            className={inputStyles}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs uppercase tracking-[0.2em] text-text-muted mb-2"
          >
            Wachtwoord
          </label>
          <input
            id="password"
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className={inputStyles}
          />
        </div>

        {state.error && (
          <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
            {state.error}
          </div>
        )}

        <Button
          type="submit"
          className={`w-full ${pending ? "opacity-50 pointer-events-none" : ""}`}
        >
          {pending ? "Bezig..." : "Inloggen"}
        </Button>
      </form>

      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-bg-subtle" />
        <span className="text-xs uppercase tracking-[0.2em] text-text-muted">of</span>
        <span className="h-px flex-1 bg-bg-subtle" />
      </div>

      <a
        href="/login/google"
        className="flex items-center justify-center gap-3 w-full border border-bg-subtle px-4 py-3 text-text text-sm hover:border-accent transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.8 2.9 14.6 2 12 2 6.9 2 2.8 6.1 2.8 11.2S6.9 20.4 12 20.4c6 0 9.3-4.2 9.3-9.3 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
        Inloggen met Google
      </a>
    </div>
  );
}

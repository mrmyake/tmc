"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { getStoredUtm } from "@/lib/utm";
import { verifyLoginOtp } from "@/lib/actions/auth";
import { trackPortalLogin } from "@/lib/analytics";

// text-base (16px) is intentional. Anything smaller triggers Safari
// mobile's auto-zoom on focus, which shifts the login card outside the
// viewport. 16px is the minimum threshold that keeps zoom disabled.
const inputStyles =
  "w-full bg-bg-elevated border border-bg-subtle px-4 py-3 text-text text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent transition-colors";

// Moet gelijk blijven aan mailer_otp_length in de Supabase Auth-config
// (6 cijfers, de conventie die leden van andere diensten kennen).
const OTP_LENGTH = 6;

// Client-side spiegel van de server-side resend-limiet
// (smtp_max_frequency = 60s in de Supabase-config). De UI toont de
// countdown zodat leden niet blind opnieuw klikken; de backend wijst
// te vroege verzoeken sowieso af.
const RESEND_COOLDOWN_S = 60;

interface Props {
  initialError?: string;
  /** Waar na succesvol inloggen heen — bijv. terug naar de flow die inloggen vereiste. */
  next?: string;
}

type Step = "email" | "code";

export function LoginForm({ initialError, next }: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>(initialError ?? "");
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // 1 interval voor de resend-countdown, tikt af naar 0.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      setCooldown((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function requestCode(): Promise<boolean> {
    const supabase = createClient();
    // Attribution meegeven bij eerste signup. De trigger
    // handle_new_auth_user leest raw_user_meta_data en kopieert naar
    // profiles. Bestaande users behouden hun originele attribution
    // (trigger doet ON CONFLICT DO NOTHING). shouldCreateUser blijft
    // op de default (true): /login is bewust het gecombineerde
    // login- plus signup-entrypoint (besluit bij spec-otp-login.md).
    const utm = getStoredUtm();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
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
      // COPY: confirm with Marlon
      setErrorMsg(error.message || "Er ging iets mis. Probeer het opnieuw.");
      return false;
    }
    return true;
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");

    const sent = await requestCode();
    setBusy(false);
    if (sent) {
      setStep("code");
      setCode("");
      setCooldown(RESEND_COOLDOWN_S);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setErrorMsg("");
    const sent = await requestCode();
    setBusy(false);
    if (sent) {
      setCode("");
      setCooldown(RESEND_COOLDOWN_S);
      codeInputRef.current?.focus();
    }
  }

  async function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorMsg("");

    const result = await verifyLoginOtp(email, code, next);

    if (!result.ok) {
      setBusy(false);
      setErrorMsg(result.error);
      return;
    }

    trackPortalLogin("otp");
    // Harde navigatie (geen router.push) zodat server components de
    // nieuwe sessie-cookies meteen oppakken, zelfde patroon als de
    // implicit-flow fallback.
    window.location.assign(result.redirectTo);
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setErrorMsg("");
    setCooldown(0);
  }

  if (step === "code") {
    return (
      <form onSubmit={handleCodeSubmit} className="space-y-5">
        <div className="bg-bg-elevated border border-accent/30 p-6 text-center">
          <div className="text-accent text-xs font-medium uppercase tracking-[0.25em] mb-3">
            Check je mail
          </div>
          {/* COPY: confirm with Marlon */}
          <p className="text-text-muted text-sm leading-relaxed">
            We hebben een code van {OTP_LENGTH} cijfers gestuurd naar{" "}
            <span className="text-text">{email}</span>. De code is 10 minuten
            geldig.
          </p>
        </div>

        <div>
          <label
            htmlFor="otp-code"
            className="block text-xs uppercase tracking-[0.2em] text-text-muted mb-2"
          >
            Inlogcode
          </label>
          <input
            id="otp-code"
            ref={codeInputRef}
            type="text"
            name="otp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={OTP_LENGTH}
            required
            autoFocus
            placeholder={"0".repeat(OTP_LENGTH)}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputStyles} text-center tracking-[0.4em] font-medium`}
          />
        </div>

        {errorMsg && (
          <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
            {errorMsg}
          </div>
        )}

        <Button
          type="submit"
          className={`w-full ${busy || code.length !== OTP_LENGTH ? "opacity-50 pointer-events-none" : ""}`}
        >
          {/* COPY: confirm with Marlon */}
          {busy ? "Bezig..." : "Inloggen"}
        </Button>

        <div className="flex items-center justify-between text-xs text-text-muted">
          <button
            type="button"
            onClick={backToEmail}
            className="hover:text-accent uppercase tracking-[0.2em] cursor-pointer"
          >
            {/* COPY: confirm with Marlon */}
            Ander e-mailadres
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || busy}
            className={
              cooldown > 0 || busy
                ? "uppercase tracking-[0.2em] opacity-50 cursor-not-allowed"
                : "hover:text-accent uppercase tracking-[0.2em] cursor-pointer"
            }
          >
            {/* COPY: confirm with Marlon */}
            {cooldown > 0 ? `Nieuwe code (${cooldown}s)` : "Nieuwe code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleEmailSubmit} className="space-y-5">
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

      {errorMsg && (
        <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
          {errorMsg}
        </div>
      )}

      <Button
        type="submit"
        className={`w-full ${busy ? "opacity-50 pointer-events-none" : ""}`}
      >
        {/* COPY: confirm with Marlon */}
        {busy ? "Bezig..." : "Stuur inlogcode"}
      </Button>

      {/* COPY: confirm with Marlon */}
      <p className="text-xs text-text-muted leading-relaxed text-center">
        Geen wachtwoord nodig. Je ontvangt een eenmalige inlogcode per mail.
      </p>
    </form>
  );
}

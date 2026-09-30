"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/client";
import { getStoredUtm } from "@/lib/utm";
import { verifyLoginOtp } from "@/lib/actions/auth";
import { saveIdentityDetails } from "@/lib/actions/profile";
import { trackFormStart } from "@/lib/analytics";
import {
  PHONE_HINT,
  validateProfileField,
  type ProfileField,
} from "@/lib/profile-validation";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

type Step = "email" | "code" | "details";

const DETAILS_FIELDS: ProfileField[] = [
  "first_name",
  "last_name",
  "phone",
  "street_address",
  "postal_code",
  "city",
];
type FieldErrors = Partial<Record<ProfileField, string>>;

function isDetailsField(name: string): name is ProfileField {
  return (DETAILS_FIELDS as string[]).includes(name);
}

interface Props {
  onDone: () => void;
  onBack: () => void;
  /**
   * event_label voor form_start op de gegevensstap. Default is de
   * bestaande /abonnement-naam; /kopen geeft "kopen_identify" mee zodat de
   * twee checkouts in GA4 uit elkaar te houden zijn (spec-analytics.md,
   * eventregister form_start).
   */
  formName?: string;
}

export function IdentifyStage({
  onDone,
  onBack,
  formName = "abonnement_identify",
}: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [cooldown, setCooldown] = useState(0);
  const detailsTracked = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      setCooldown((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function requestCode(): Promise<boolean> {
    const supabase = createClient();
    const utm = getStoredUtm();
    // Bewust afwijkend van /login (src/app/login/LoginForm.tsx, dat
    // shouldCreateUser: false zet). Dit is de enige component waar een
    // nieuw account mag ontstaan, op precies twee routes: /abonnement en
    // /kopen. Op beide heeft de bezoeker net iets gekozen en is aanmaken de
    // bedoeling. Niet "consistent maken" met /login; zie spec-otp-login.md,
    // "Scheiding /login en checkout" (2026-09-08).
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: {
          acquisition_source: utm.utm_source,
          acquisition_medium: utm.utm_medium,
          acquisition_campaign: utm.utm_campaign,
          acquisition_content: utm.utm_content,
          signup_path:
            typeof window !== "undefined" ? window.location.pathname : undefined,
          first_touch_at: new Date().toISOString(),
        },
      },
    });
    if (error) {
      // COPY: confirm met Marlon
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
    }
  }

  async function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    // Zie LoginForm: dezelfde UTM-set, zodat een bestaand profiel dat via de
    // configurator inlogt alsnog een campagnebron krijgt als die nog ontbreekt.
    const utm = getStoredUtm();
    const result = await verifyLoginOtp(email, code, undefined, {
      acquisitionSource: utm.utm_source,
      acquisitionMedium: utm.utm_medium,
      acquisitionCampaign: utm.utm_campaign,
      acquisitionContent: utm.utm_content,
      signupPath: window.location.pathname,
      firstTouchAt: new Date().toISOString(),
    });
    setBusy(false);
    if (!result.ok) {
      setErrorMsg(result.error);
      return;
    }
    setStep("details");
  }

  function handleDetailsFocus() {
    if (!detailsTracked.current) {
      trackFormStart(formName);
      detailsTracked.current = true;
    }
  }

  function focusField(form: HTMLFormElement, name: ProfileField) {
    (form.elements.namedItem(name) as HTMLInputElement | null)?.focus();
  }

  // Validatie bij blur, met dezelfde regels als de server action.
  function handleDetailsBlur(e: React.FocusEvent<HTMLFormElement>) {
    const { name, value } = e.target as unknown as HTMLInputElement;
    if (!isDetailsField(name)) return;
    const msg = validateProfileField(name, value, { required: true });
    setFieldErrors((prev) => ({ ...prev, [name]: msg ?? undefined }));
  }

  // Een getoonde fout verdwijnt zodra het veld weer wordt aangepast.
  function handleDetailsChange(e: React.ChangeEvent<HTMLFormElement>) {
    const { name } = e.target as unknown as HTMLInputElement;
    if (isDetailsField(name) && fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  // onSubmit i.p.v. form action={...}: een action-formulier wordt door
  // React 19 na afloop teruggezet, waardoor alle ingevulde velden na een
  // fout leeg zijn. Met preventDefault blijft de invoer staan.
  function handleDetailsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    setErrorMsg("");

    const errors: FieldErrors = {};
    for (const name of DETAILS_FIELDS) {
      const msg = validateProfileField(name, String(formData.get(name) ?? ""), {
        required: true,
      });
      if (msg) errors[name] = msg;
    }
    setFieldErrors(errors);
    const firstInvalid = DETAILS_FIELDS.find((n) => errors[n]);
    if (firstInvalid) {
      setErrorMsg(errors[firstInvalid] as string);
      focusField(form, firstInvalid);
      return;
    }

    setBusy(true);
    saveIdentityDetails(formData).then((res) => {
      setBusy(false);
      if (!res.ok) {
        setErrorMsg(res.error);
        if (res.field) {
          setFieldErrors({ [res.field]: res.error });
          focusField(form, res.field);
        }
        return;
      }
      onDone();
    });
  }

  function detailsFieldProps(name: ProfileField) {
    const id = `identify-${name}-error`;
    return {
      field: { error: fieldErrors[name], errorId: id },
      input: {
        name,
        "aria-invalid": fieldErrors[name] ? (true as const) : undefined,
        "aria-describedby": fieldErrors[name] ? id : undefined,
      },
    };
  }

  if (step === "details") {
    return (
      <div>
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          Stap 02 · Jouw gegevens
        </span>
        {/* COPY: confirm met Marlon */}
        <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
          Wie mogen we verwelkomen?
        </h1>
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted mb-8 max-w-xl">
          Je naam en adres hebben we nodig voor je facturering en de
          automatische incasso via Mollie.
        </p>

        <form
          onSubmit={handleDetailsSubmit}
          onFocus={handleDetailsFocus}
          onBlur={handleDetailsBlur}
          onChange={handleDetailsChange}
          noValidate
          className="flex flex-col gap-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Field label="Voornaam" {...detailsFieldProps("first_name").field}>
              <input
                type="text"
                {...detailsFieldProps("first_name").input}
                required
                autoComplete="given-name"
                className={fieldInputClasses}
              />
            </Field>
            <Field label="Achternaam" {...detailsFieldProps("last_name").field}>
              <input
                type="text"
                {...detailsFieldProps("last_name").input}
                required
                autoComplete="family-name"
                className={fieldInputClasses}
              />
            </Field>
          </div>
          {/* COPY: confirm met Marlon (PHONE_HINT) */}
          <Field
            label="Telefoon"
            hint={PHONE_HINT}
            {...detailsFieldProps("phone").field}
          >
            <input
              type="tel"
              {...detailsFieldProps("phone").input}
              required
              autoComplete="tel"
              className={fieldInputClasses}
            />
          </Field>
          <Field label="Straat + nummer" {...detailsFieldProps("street_address").field}>
            <input
              type="text"
              {...detailsFieldProps("street_address").input}
              required
              autoComplete="street-address"
              className={fieldInputClasses}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-6">
            <Field label="Postcode" {...detailsFieldProps("postal_code").field}>
              <input
                type="text"
                {...detailsFieldProps("postal_code").input}
                required
                autoComplete="postal-code"
                className={fieldInputClasses}
              />
            </Field>
            <Field label="Plaats" {...detailsFieldProps("city").field}>
              <input
                type="text"
                {...detailsFieldProps("city").input}
                required
                autoComplete="address-level2"
                className={fieldInputClasses}
              />
            </Field>
          </div>

          {errorMsg && (
            <p role="alert" className="text-[color:var(--danger)] text-sm">
              {errorMsg}
            </p>
          )}

          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onBack}
              className="text-xs uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Terug
            </button>
            <Button
              type="submit"
              className={busy ? "opacity-50 pointer-events-none" : ""}
            >
              {/* COPY: confirm met Marlon */}
              {busy ? "Opslaan..." : "Ga verder naar betalen"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div>
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          Stap 02 · Bevestig je e-mailadres
        </span>
        <form onSubmit={handleCodeSubmit} className="space-y-5 max-w-md">
          <div className="bg-bg-elevated border border-accent/30 p-6 text-center">
            <div className="text-accent text-xs font-medium uppercase tracking-[0.25em] mb-3">
              Check je mail
            </div>
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-sm leading-relaxed">
              We hebben een code van {OTP_LENGTH} cijfers gestuurd naar{" "}
              <span className="text-text">{email}</span>. De code is 10 minuten
              geldig.
            </p>
          </div>

          <div>
            <label
              htmlFor="abonnement-otp-code"
              className="block text-xs uppercase tracking-[0.2em] text-text-muted mb-2"
            >
              Inlogcode
            </label>
            <input
              id="abonnement-otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={OTP_LENGTH}
              required
              autoFocus
              placeholder={"0".repeat(OTP_LENGTH)}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${fieldInputClasses} text-center tracking-[0.4em] font-medium`}
            />
          </div>

          {errorMsg && (
            <p role="alert" className="text-[color:var(--danger)] text-sm">
              {errorMsg}
            </p>
          )}

          <Button
            type="submit"
            className={`w-full ${
              busy || code.length !== OTP_LENGTH ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {/* COPY: confirm met Marlon */}
            {busy ? "Bezig..." : "Bevestigen"}
          </Button>

          <div className="flex items-center justify-between text-xs text-text-muted">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setErrorMsg("");
                setCooldown(0);
              }}
              className="hover:text-accent uppercase tracking-[0.2em] cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
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
              {/* COPY: confirm met Marlon */}
              {cooldown > 0 ? `Nieuwe code (${cooldown}s)` : "Nieuwe code"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        Stap 02 · Wie ben je?
      </span>
      {/* COPY: confirm met Marlon */}
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
        Bevestig je e-mailadres.
      </h1>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted mb-8 max-w-xl">
        Geen wachtwoord nodig. Je ontvangt een eenmalige inlogcode per mail.
      </p>

      <form onSubmit={handleEmailSubmit} className="space-y-5 max-w-md">
        <Field label="E-mailadres">
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="naam@voorbeeld.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldInputClasses}
          />
        </Field>

        {errorMsg && (
          <p role="alert" className="text-[color:var(--danger)] text-sm">
            {errorMsg}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="text-xs uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            Terug
          </button>
          <Button
            type="submit"
            className={busy ? "opacity-50 pointer-events-none" : ""}
          >
            {/* COPY: confirm met Marlon */}
            {busy ? "Bezig..." : "Stuur inlogcode"}
          </Button>
        </div>
      </form>
    </div>
  );
}

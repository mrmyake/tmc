"use client";

import { useEffect, useRef, useState } from "react";
import { trackFormStart, trackKennismakingHormoonprofiel } from "@/lib/analytics";
import { parseAttribution } from "@/lib/attribution/params";
import { leadAttributionForSubmit } from "@/lib/attribution/consent";
import { CONTACT, RESPONSE_TIME } from "../../../content/hormoonprofiel/shared";
import { tmcHref, type HpVariant } from "./links";
import s from "./hp.module.css";

// COPY: confirm met Marlon (alle teksten in dit bestand)

/**
 * Kennismakingsformulier. Verstuurt naar /api/leads/hormoonprofiel op de eigen
 * host. Spam: een honeypot (`website`) en de invultijd sinds het mounten; de
 * server weigert stil onder de 3 seconden. De bevestiging staat inline.
 */
export function Kennismaking({ variant }: { variant: HpVariant }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const mountedAt = useRef<number>(0);
  const submissionId = useRef<string | null>(null);

  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);

  const email = variant === "standalone" ? CONTACT.emailStandalone : CONTACT.emailSection;

  const onFocus = () => {
    if (started.current) return;
    started.current = true;
    trackFormStart("hormoonprofiel_kennismaking");
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(false);
    const form = new FormData(e.currentTarget);
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    const attribution = leadAttributionForSubmit(
      parseAttribution(new URLSearchParams(window.location.search)),
    );
    const payload = {
      ...Object.fromEntries(form.entries()),
      variant,
      submissionId: submissionId.current,
      elapsedMs: Math.round(performance.now() - mountedAt.current),
      attribution,
    };
    try {
      const res = await fetch("/api/leads/hormoonprofiel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch {
      // Geen bevestiging en geen conversie: de aanvraag is niet aangekomen.
      setError(true);
      setLoading(false);
      return;
    }
    trackKennismakingHormoonprofiel(variant);
    setLoading(false);
    setDone(true);
  };

  return (
    <section className={s.closing} id="kennismaken">
      <div className={`${s.wrap} ${s.two}`}>
        <div>
          <div className={s.eyebrow}>Kennismaken</div>
          <h2 className={`${s.display}`}>Plan een kennismaking met Marlon</h2>
          <p className={s.sub}>
            Vertel waar je aan wilt werken. Marlon neemt {RESPONSE_TIME} contact op voor een
            vrijblijvend gesprek in de studio in Loosdrecht.
          </p>
        </div>

        {done ? (
          <div className={s.formDone} role="status">
            <h3>Bedankt, je aanvraag is binnen</h3>
            <p>Marlon neemt {RESPONSE_TIME} contact met je op.</p>
          </div>
        ) : (
          <form className={s.form} onSubmit={onSubmit} onFocus={onFocus} noValidate={false}>
            <div className={s.row2}>
              <label>
                Voornaam
                <input name="firstName" required maxLength={80} autoComplete="given-name" />
              </label>
              <label>
                Achternaam
                <input name="lastName" required maxLength={80} autoComplete="family-name" />
              </label>
            </div>
            <div className={s.row2}>
              <label>
                Telefoon
                <input
                  name="phone"
                  type="tel"
                  required
                  maxLength={40}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="06 ..."
                />
              </label>
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="naam@voorbeeld.nl"
                />
              </label>
            </div>
            <label>
              Waar wil je aan werken?
              <textarea
                name="message"
                maxLength={2000}
                placeholder="Bijvoorbeeld: meer energie, vet kwijt op een bepaalde plek, sterker worden"
              />
            </label>
            {/* Honeypot: mensen zien en vullen dit nooit. */}
            <div className={s.hpot} aria-hidden="true">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {error ? (
              <p className={s.formError} role="alert">
                Er ging iets mis en je aanvraag is niet verstuurd. Probeer het nog eens, of neem
                contact op via{" "}
                <a href={`tel:${CONTACT.phoneE164}`}>{CONTACT.phoneDisplay}</a> of{" "}
                <a href={`mailto:${email}`}>{email}</a>.
              </p>
            ) : null}
            <button className={s.btn} type="submit" disabled={loading}>
              {loading ? "Versturen..." : "Verstuur aanvraag"}
            </button>
            <small>
              Je gegevens gaan alleen naar Marlon en worden gebruikt om contact met je op te nemen.{" "}
              <a href={tmcHref(variant, "/privacybeleid")}>Privacybeleid</a>
            </small>
          </form>
        )}
      </div>
    </section>
  );
}


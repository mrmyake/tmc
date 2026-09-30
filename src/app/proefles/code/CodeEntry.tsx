"use client";

import { useState } from "react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { checkTrialCode } from "@/lib/actions/trial-code";
import { normalizeTrialCode } from "@/lib/trial-codes/normalize";

interface Props {
  /** Melding uit een eerdere stap (bv. de code bleek bij het boeken ongeldig). */
  initialMessage?: string;
  /** De pagina wordt opnieuw opgehaald na een geldige code: knop blijft bezig. */
  finishing?: boolean;
  onValid: () => void;
}

/**
 * Stap 1 van de codeflow: de code invoeren. De server beslist of de code
 * geldig is (checkTrialCode) en zet dan het httpOnly-cookie; deze
 * component onthoudt zelf niets over de geldigheid.
 */
export function CodeEntry({ initialMessage = "", finishing = false, onValid }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(initialMessage);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await checkTrialCode(code);
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    // Bij succes blijft de knop bezig tot de pagina de sessiekiezer toont.
    onValid();
  }

  return (
    <Section className="pt-32 md:pt-40 min-h-[80vh] flex items-center">
      <Container className="max-w-3xl">
        <ScrollReveal>
          <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
            <span aria-hidden className="w-12 h-px bg-accent" />
            {/* COPY: confirm met Marlon */}
            Gratis · Met proefcode
            <span aria-hidden className="w-12 h-px bg-accent" />
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
            {/* COPY: confirm met Marlon */}
            Vul je proefcode in
          </h1>
          <p className="text-text-muted text-lg leading-relaxed mb-10 max-w-xl">
            {/* COPY: confirm met Marlon */}
            Heb je een proefcode gekregen? Vul die hieronder in, dan kies je
            daarna zelf een sessie en is je proefles gratis.
          </p>

          <form onSubmit={submit} className="max-w-sm space-y-6">
            <Field label="Proefcode">
              <input
                type="text"
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(normalizeTrialCode(e.target.value))}
                className={`${fieldInputClasses} font-mono uppercase tracking-[0.1em]`}
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              className={`w-full text-center ${busy || finishing ? "opacity-50 pointer-events-none" : ""}`}
            >
              {/* COPY: confirm met Marlon */}
              {busy || finishing ? "Bezig..." : "Code controleren"}
            </Button>
          </form>
        </ScrollReveal>
      </Container>
    </Section>
  );
}

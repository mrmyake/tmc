"use client";

import { useEffect, useRef, useState } from "react";
import { formatEuroInput, parseEuroInput } from "@/lib/euro-input";

interface EuroInputProps {
  /** Centen van buitenaf. Wijzigt dit terwijl het veld geen focus heeft en
   * is het niet de echo van onze eigen onChange, dan volgt de tekst. */
  value: number;
  /** Centen bij geldige invoer, null bij leeg of ongeldig. Wordt bij elke
   * toetsaanslag aangeroepen; de tekst in het veld verandert daar niet van. */
  onChange: (cents: number | null) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Eén tekstveld voor een bedrag: je typt "90,50" zoals je het uitspreekt.
 * `type="text"` met `inputMode="decimal"`, nooit `type="number"` (die
 * gedraagt zich per locale anders bij de komma). Tijdens typen wordt niets
 * herformatteerd, dus de cursor blijft staan. Bij blur wordt een geldige
 * waarde als "1.234,50" getoond; een ongeldige waarde blijft staan met een
 * korte melding. Er wordt nooit stil gecorrigeerd of afgerond.
 */
export function EuroInput({
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: EuroInputProps) {
  const [text, setText] = useState(() => formatEuroInput(value));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  // Laatste waarde die wij zelf naar buiten hebben gemeld. Een wijziging van
  // `value` die hiermee gelijk is, is de echo van onze eigen onChange.
  const lastEmitted = useRef<number | null>(value);

  useEffect(() => {
    if (focused.current) return;
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setText(formatEuroInput(value));
    setInvalid(false);
  }, [value]);

  function handleChange(next: string) {
    setText(next);
    const cents = parseEuroInput(next);
    lastEmitted.current = cents;
    // Een lege of half getypte waarde ("-" of "90,5x") toont pas bij blur
    // een fout; tijdens het typen is dat storend.
    if (cents !== null) setInvalid(false);
    onChange(cents);
  }

  function handleBlur() {
    focused.current = false;
    const cents = parseEuroInput(text);
    if (cents === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(formatEuroInput(cents));
  }

  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={handleBlur}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={[
          className,
          invalid ? "border-[color:var(--danger)]!" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {invalid && (
        // COPY: confirm met Marlon
        <span role="alert" className="text-[color:var(--danger)] text-[10px]">
          Ongeldig bedrag, typ bijvoorbeeld 90,50
        </span>
      )}
    </div>
  );
}

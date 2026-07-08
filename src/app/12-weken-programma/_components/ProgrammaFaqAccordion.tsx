"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ProgrammaFaqItem {
  question: string;
  answer: string;
}

interface Props {
  faqs: ProgrammaFaqItem[];
  defaultOpenIndex?: number | null;
}

/**
 * FAQ-accordion voor /12-weken-programma. Fork van
 * `components/blocks/yoga/YogaFaqAccordion` in plaats van hergebruik: de
 * mockup gebruikt een Fraunces-vraagregel met een roterend "+"-icoon op een
 * lichte (stone) achtergrond, duidelijk anders dan de yoga-variant z'n
 * Inter+chevron-stijl op een donkere achtergrond. Zelfde
 * single-open-at-a-time gedrag en AnimatePresence height-animatie, dus geen
 * derde, volledig los patroon.
 */
export function ProgrammaFaqAccordion({ faqs, defaultOpenIndex = 0 }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpenIndex);

  if (!faqs.length) return null;

  return (
    <div className="border-y border-border-on-light divide-y divide-border-on-light">
      {faqs.map((faq, i) => {
        const open = openIndex === i;
        return (
          <div key={faq.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-6 py-6 text-left cursor-pointer group"
            >
              <span className="font-[family-name:var(--font-playfair)] text-lg md:text-xl text-on-light">
                {faq.question}
              </span>
              <span
                aria-hidden
                className={`text-accent text-2xl font-light shrink-0 transition-transform duration-300 motion-reduce:transition-none ${
                  open ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <p className="pb-6 text-on-light-muted leading-relaxed max-w-[66ch]">
                    {faq.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

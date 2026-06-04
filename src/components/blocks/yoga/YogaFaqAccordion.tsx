"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

export interface YogaFaqItem {
  question: string;
  answer: string;
}

interface Props {
  faqs: YogaFaqItem[];
}

/**
 * FAQ-accordion voor de yoga-vormpagina's. Antwoorden zijn platte tekst
 * (zo komen ze uit het yogaStyle.faqs veld), wat het later eenvoudig
 * maakt om dezelfde data in FAQPage JSON-LD te hergebruiken (PR-Y4).
 */
export function YogaFaqAccordion({ faqs }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!faqs.length) return null;

  return (
    <div className="max-w-3xl mx-auto divide-y divide-bg-elevated border-y border-bg-elevated">
      {faqs.map((faq, i) => {
        const open = openIndex === i;
        return (
          <div key={faq.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-6 py-5 text-left cursor-pointer group"
            >
              <span className="text-text font-medium group-hover:text-accent transition-colors">
                {faq.question}
              </span>
              <ChevronDown
                size={20}
                className={`text-text-muted flex-shrink-0 transition-transform ${
                  open ? "rotate-180 text-accent" : ""
                }`}
              />
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
                  <p className="pb-5 text-text-muted leading-relaxed">
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

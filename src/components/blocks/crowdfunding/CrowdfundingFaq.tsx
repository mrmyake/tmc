"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { PortableText } from "@portabletext/react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { SanityFaq } from "../../../../sanity/lib/fetch";

interface Props {
  faqs: SanityFaq[];
}

export function CrowdfundingFaq({ faqs }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!faqs.length) return null;

  return (
    <Section id="faq">
      <Container>
        <SectionHeading label="FAQ" heading="Veelgestelde vragen" />

        <div className="max-w-3xl mx-auto divide-y divide-bg-elevated border-y border-bg-elevated">
          {faqs.map((faq) => {
            const open = openId === faq._id;
            return (
              <div key={faq._id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : faq._id)}
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
                      <div className="pb-5 text-text-muted leading-relaxed prose prose-invert max-w-none">
                        <PortableText
                          value={
                            faq.answer as Parameters<typeof PortableText>[0]["value"]
                          }
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}

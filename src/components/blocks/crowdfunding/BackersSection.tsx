"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  anonymizeName,
  relativeTimeNL,
} from "@/lib/crowdfunding-helpers";
import type { CrowdfundingBacker } from "@/lib/supabase";

interface Props {
  backers: CrowdfundingBacker[];
  totalBackers: number;
}

export function BackersSection({ backers, totalBackers }: Props) {
  return (
    <Section bg="elevated">
      <Container>
        <SectionHeading
          label="Live"
          heading="Recente moves"
          subtext={
            totalBackers > 0
              ? `${totalBackers} ${
                  totalBackers === 1 ? "backer" : "backers"
                } en counting.`
              : "Wees de eerste die zijn move maakt."
          }
        />

        {backers.length === 0 ? (
          <p className="text-center text-text-muted">
            Nog geen backers — jouw naam kan hier als eerste staan.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            <AnimatePresence mode="popLayout" initial={false}>
              {backers.map((b) => (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="bg-bg-subtle border border-bg-elevated/80 px-5 py-4 flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-full bg-accent/15 text-accent font-medium flex items-center justify-center uppercase text-sm flex-shrink-0">
                    {anonymizeName(b.name).charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-text font-medium truncate">
                      {anonymizeName(b.name)}
                    </div>
                    <div className="text-text-muted text-xs mt-1">
                      {b.tier_name} · {relativeTimeNL(b.created_at)}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Container>
    </Section>
  );
}

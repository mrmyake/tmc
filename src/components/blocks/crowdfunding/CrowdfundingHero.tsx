"use client";

import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { ProgressPanel } from "./ProgressPanel";
import { urlFor } from "../../../../sanity/lib/client";
import type { SanityImage } from "../../../../sanity/lib/fetch";

interface Props {
  headline: string;
  subline?: string;
  heroImage?: SanityImage;
  totalRaised: number;
  totalBackers: number;
  goal: number;
  daysLeft: number | null;
  active: boolean;
}

export function CrowdfundingHero({
  headline,
  subline,
  heroImage,
  totalRaised,
  totalBackers,
  goal,
  daysLeft,
  active,
}: Props) {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {heroImage?.asset ? (
        // LCP image — served direct from Sanity's Fastly CDN. See
        // Hero.tsx for the full rationale on skipping next/image and
        // deliberately omitting fetchpriority="high" here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urlFor(heroImage).width(1920).url()}
          alt="The Movement Club crowdfunding"
          width={1920}
          height={1080}
          decoding="async"
          loading="eager"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg-elevated to-bg" />
      )}
      <div className="absolute inset-0 bg-bg/70" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/50 via-transparent to-bg" />

      <Container className="relative z-10 pt-24 pb-20">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-7 text-center lg:text-left">
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="tmc-eyebrow tmc-eyebrow--accent inline-block mb-6"
            >
              {active
                ? "Crowdfunding · Loosdrecht"
                : "Binnenkort · Loosdrecht"}
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl lg:text-8xl text-text mb-6 leading-[0.95]"
            >
              {headline}
            </motion.h1>

            {subline && (
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="text-text-muted text-lg md:text-xl max-w-xl mx-auto lg:mx-0 mb-10"
              >
                {subline}
              </motion.p>
            )}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Button href="#tiers">Kies jouw tier</Button>
              <Button href="#verhaal" variant="secondary">
                Lees het verhaal
              </Button>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="lg:col-span-5"
          >
            <ProgressPanel
              totalRaised={totalRaised}
              totalBackers={totalBackers}
              goal={goal}
              daysLeft={daysLeft}
            />
          </motion.div>
        </div>
      </Container>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <ChevronDown className="text-text-muted" size={28} />
        </motion.div>
      </motion.div>
    </section>
  );
}

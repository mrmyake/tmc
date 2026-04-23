"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import type { SanitySettings, SanityImage } from "../../../sanity/lib/fetch";
import { urlFor } from "../../../sanity/lib/client";

interface HeroProps {
  settings: SanitySettings;
  heroImage?: SanityImage;
}

const clubEase: [number, number, number, number] = [0.2, 0.7, 0.1, 1];

function renderTaglineWithAccent(tagline: string, accent?: string) {
  if (!accent) return tagline;
  const trimmed = accent.trim();
  if (!trimmed) return tagline;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = tagline.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      <em key={i} className="not-italic text-accent">
        {part}
      </em>
    ) : (
      part
    ),
  );
}

export function Hero({ settings, heroImage }: HeroProps) {
  return (
    <section className="tmc-grain relative min-h-screen flex items-center justify-center overflow-hidden">
      {heroImage?.asset ? (
        <Image
          src={urlFor(heroImage).width(2560).quality(80).url()}
          alt="The Movement Club studio"
          fill
          sizes="100vw"
          priority
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-bg" />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/50 to-bg"
      />

      <Container className="relative z-10 text-center pt-20">
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: clubEase }}
          className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8"
        >
          <span aria-hidden className="w-12 h-px bg-accent" />
          Boutique training studio · {settings.address.city}
          <span aria-hidden className="w-12 h-px bg-accent" />
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: clubEase }}
          className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl lg:text-8xl xl:text-[9rem] text-text mb-8 leading-[1.02] tracking-[-0.02em]"
        >
          {renderTaglineWithAccent(settings.tagline, settings.taglineAccent)}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: clubEase }}
          className="text-text-muted text-lg md:text-xl max-w-2xl mx-auto mb-10"
        >
          Boutique training studio in {settings.address.city}. Kleine groepen,
          echte coaching, patronen die blijven.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8, ease: clubEase }}
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button href="/proefles">Plan je proefles</Button>
            <Button href="/beweeg-beter" variant="secondary">
              Download de guide
            </Button>
          </div>
        </motion.div>
      </Container>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8, ease: clubEase }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10"
        aria-hidden
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        >
          <ChevronDown
            className="text-text-muted"
            size={28}
            strokeWidth={1.5}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}

"use client";

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

export function Hero({ settings, heroImage }: HeroProps) {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {heroImage?.asset ? (
        <img
          src={urlFor(heroImage).width(2560).quality(80).url()}
          alt="The Movement Club studio"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-bg" />
      )}
      <div className="absolute inset-0 bg-bg/60" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-transparent to-bg" />

      <Container className="relative z-10 text-center pt-20">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-6"
        >
          Boutique Training Studio · {settings.address.city}
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl lg:text-7xl xl:text-8xl text-text mb-6 leading-[1.1]"
        >
          {settings.tagline}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-text-muted text-lg md:text-xl max-w-2xl mx-auto mb-10"
        >
          Boutique training studio in {settings.address.city}. Persoonlijk.
          Exclusief. Resultaatgericht.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button href="/proefles">Boek een proefles</Button>
            <Button href="/beweeg-beter" variant="secondary">
              Of download onze gratis guide
            </Button>
          </div>
        </motion.div>
      </Container>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
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

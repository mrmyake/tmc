"use client";

// LazyMotion + `m.*` ipv `motion.*` — laadt alleen domAnimation
// features (~20 KiB minder op /crowdfunding bundle). Werkt voor
// de fade/y-translate animaties hier; géén `layout`, `layoutId` of
// drag gebruikt.
import { LazyMotion, domAnimation, m } from "framer-motion";
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
    <LazyMotion features={domAnimation} strict>
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {heroImage?.asset ? (
        // LCP image — served direct from Sanity's Fastly CDN. Responsive
        // srcset zodat mobile ~50 KiB pakt ipv 900 KiB desktop variant.
        // Zelfde patroon als main-site Hero.tsx. auto=format + q=75
        // komen uit de central urlFor default.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urlFor(heroImage).width(1280).url()}
          srcSet={`${urlFor(heroImage).width(640).url()} 640w, ${urlFor(heroImage).width(1024).url()} 1024w, ${urlFor(heroImage).width(1600).url()} 1600w, ${urlFor(heroImage).width(1920).url()} 1920w`}
          sizes="100vw"
          alt="The Movement Club crowdfunding"
          width={1920}
          height={1080}
          fetchPriority="high"
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
            <m.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="tmc-eyebrow tmc-eyebrow--accent inline-block mb-6"
            >
              {active
                ? "Crowdfunding · Loosdrecht"
                : "Binnenkort · Loosdrecht"}
            </m.span>

            <m.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl lg:text-8xl text-text mb-6 leading-[0.95]"
            >
              {headline}
            </m.h1>

            {subline && (
              <m.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="text-text-muted text-lg md:text-xl max-w-xl mx-auto lg:mx-0 mb-10"
              >
                {subline}
              </m.p>
            )}

            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Button href="#tiers">Kies jouw tier</Button>
              <Button href="#verhaal" variant="secondary">
                Lees het verhaal
              </Button>
            </m.div>
          </div>

          <m.div
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
          </m.div>
        </div>
      </Container>

      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <m.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <ChevronDown className="text-text-muted" size={28} />
        </m.div>
      </m.div>
    </section>
    </LazyMotion>
  );
}

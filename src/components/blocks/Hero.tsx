import { ChevronDown } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import type { SanitySettings, SanityImage } from "../../../sanity/lib/fetch";
import { urlFor } from "../../../sanity/lib/client";

interface HeroProps {
  settings: SanitySettings;
  heroImage?: SanityImage;
}

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

/**
 * Server component. Paints the LCP image + H1 synchronously. Entrance
 * fades for secondary copy use the `.tmc-fade-up` CSS animation (see
 * globals.css) so framer-motion doesn't land in the critical bundle.
 */
export function Hero({ settings, heroImage }: HeroProps) {
  return (
    <section className="tmc-grain relative min-h-screen flex items-center justify-center overflow-hidden">
      {heroImage?.asset ? (
        // LCP image. We skip next/image here on purpose: the Vercel
        // optimizer has to re-fetch the 2560px Sanity source and
        // transcode every srcset variant on cold cache (~35s LCP
        // measured). Sanity's CDN (Fastly) already serves WebP
        // directly and scales by query param.
        //
        // NOTE: intentionally NO fetchpriority="high". React 19
        // auto-emits a <link rel=preload fetchpriority=high> for
        // high-priority imgs, which — above the stylesheet in <head>
        // — starves the 105 KiB CSS on 4G and delays FCP by ~1.5s.
        // loading="eager" is enough to keep the image out of the
        // lazy-load pool.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urlFor(heroImage)
            .width(1920)
            .quality(75)
            .format("webp")
            .url()}
          alt="The Movement Club studio"
          width={1920}
          height={1080}
          decoding="async"
          loading="eager"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-bg" />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/50 to-bg"
      />

      <Container className="relative z-10 text-center pt-20">
        <span
          style={{ animationDelay: "0.2s" }}
          className="tmc-fade-up inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8"
        >
          <span aria-hidden className="w-12 h-px bg-accent" />
          Boutique training studio · {settings.address.city}
          <span aria-hidden className="w-12 h-px bg-accent" />
        </span>

        {/* LCP element — intentionally renders synchronously with no
            animation so it paints immediately. */}
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl lg:text-8xl xl:text-[9rem] text-text mb-8 leading-[1.02] tracking-[-0.02em]">
          {renderTaglineWithAccent(settings.tagline, settings.taglineAccent)}
        </h1>

        <p
          style={{ animationDelay: "0.5s" }}
          className="tmc-fade-up text-text-muted text-lg md:text-xl max-w-2xl mx-auto mb-10"
        >
          Boutique training studio in {settings.address.city}. Kleine groepen,
          echte coaching, patronen die blijven.
        </p>

        <div
          style={{ animationDelay: "0.7s" }}
          className="tmc-fade-up flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button href="/proefles">Plan je proefles</Button>
          <Button href="/beweeg-beter" variant="secondary">
            Download de guide
          </Button>
        </div>
      </Container>

      <div
        style={{ animationDelay: "1.2s" }}
        className="tmc-fade-up absolute bottom-10 left-1/2 -translate-x-1/2 z-10"
        aria-hidden
      >
        <ChevronDown
          className="text-text-muted animate-bounce"
          size={28}
          strokeWidth={1.5}
        />
      </div>
    </section>
  );
}

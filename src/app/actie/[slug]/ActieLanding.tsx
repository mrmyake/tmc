"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { pushDataLayer } from "@/lib/data-layer";

/**
 * De actiepagina zelf (spec-proefles-funnel.md): alleen het woordmerk, één
 * aanbod, één knop. Alle teksten komen als props van de server
 * (src/lib/actie/content.ts); deze component kent geen proefcode en krijgt er
 * ook geen: de knop gaat naar /actie/[slug]/start, die de rest server-side
 * regelt.
 *
 * De knop is een gewone <a>, geen next/link: de startroute zet een cookie en
 * mag nooit vooraf opgehaald worden.
 */

export interface ActieRoosterRow {
  key: string;
  /** "di 18 nov", al opgemaakt in Europe/Amsterdam. */
  day: string;
  /** "09:00". */
  time: string;
  title: string;
  duration: string;
  status: "free" | "few";
}

interface Props {
  slug: string;
  content: {
    pill: string;
    h1: string;
    lead: string;
    benefits: readonly { title: string; text: string }[];
    roosterTitle: string;
  };
  shared: {
    cta: string;
    ctaSub: string;
    whatsappHelp: string;
    whatsappAria: string;
    roosterLive: string;
    statusFree: string;
    statusFew: string;
    roosterEmpty: string;
    smallPrint: string;
    privacy: string;
    terms: string;
  };
  googleScore: { score: string; reviews: string };
  rows: ActieRoosterRow[];
  photoUrl: string | null;
  startHref: string;
  whatsappHref: string;
  address: string;
}

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CTA_CLASS = `flex min-h-[54px] w-full items-center justify-center rounded-[4px] bg-accent px-6 text-[15px] font-semibold text-ink-900 transition-colors duration-300 hover:bg-accent-hover ${FOCUS_RING}`;
const SERIF = "font-[family-name:var(--font-playfair)]";

export function ActieLanding({
  slug,
  content,
  shared,
  googleScore,
  rows,
  photoUrl,
  startHref,
  whatsappHref,
  address,
}: Props) {
  // De vaste balk op mobiel is er alleen als de knop in de pagina uit beeld
  // is. Start op "in beeld" (server en eerste render gelijk); de observer
  // corrigeert direct na het laden. Op een klein scherm staat de knop onder
  // de vouw en schuift de balk dus meteen in beeld.
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const [ctaInView, setCtaInView] = useState(true);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCtaInView(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const showBar = !ctaInView;
  const onWhatsapp = () => pushDataLayer("actie_whatsapp_click", { slug });

  return (
    <div className="min-h-screen bg-ink-900 text-stone-100">
      <header className="mx-auto max-w-6xl px-6 py-5 lg:px-8">
        {/* Alleen het woordmerk: geen link, geen menu. */}
        <p className={`${SERIF} text-xl tracking-[-0.01em] text-stone-100`}>
          The Movement <span className="text-accent">Club</span>
        </p>
      </header>

      <main className="mx-auto max-w-6xl pb-32 min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:items-start min-[900px]:gap-14 min-[900px]:px-8 min-[900px]:pb-20">
        {/* Foto: mobiel over de volle breedte, desktop sticky links */}
        <div className="relative h-[380px] w-full overflow-hidden bg-[#171412] min-[900px]:sticky min-[900px]:top-8 min-[900px]:h-[640px] min-[900px]:rounded-[8px]">
          {photoUrl && (
            <Image
              src={photoUrl}
              alt="Trainer Marlon in de studio"
              fill
              priority
              sizes="(min-width: 900px) 560px, 100vw"
              className="object-cover object-[center_25%]"
            />
          )}
          <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-[4px] bg-ink-900/85 px-3 py-2 text-sm backdrop-blur-sm">
            <span aria-hidden className="text-accent">
              ★
            </span>
            <span className="font-semibold text-stone-100">{googleScore.score}</span>
            <span className="text-stone-100/62">op Google, {googleScore.reviews}</span>
          </div>
        </div>

        <div className="px-6 pt-8 min-[900px]:px-0 min-[900px]:pt-2">
          <span className="inline-flex items-center rounded-full border border-accent/60 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-accent">
            {content.pill}
          </span>
          <h1
            className={`${SERIF} mt-6 text-4xl leading-[1.05] tracking-[-0.02em] text-stone-100 md:text-5xl`}
          >
            {content.h1}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-100/62">{content.lead}</p>

          <div className="mt-8">
            <a
              ref={ctaRef}
              href={startHref}
              onClick={() => pushDataLayer("proefles_cta_click", { variant: "actie", slug })}
              className={CTA_CLASS}
            >
              {shared.cta}
            </a>
            <p className="mt-3 text-center text-sm text-stone-100/62">{shared.ctaSub}</p>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onWhatsapp}
              className={`mt-4 hidden items-center justify-center gap-2 rounded-[4px] text-sm text-stone-100 underline decoration-stone-100/40 underline-offset-4 transition-colors hover:text-accent hover:decoration-accent min-[900px]:flex ${FOCUS_RING}`}
            >
              <MessageCircle size={16} strokeWidth={1.5} aria-hidden />
              {shared.whatsappHelp}
            </a>
          </div>

          <ol className="mt-12 divide-y divide-stone-100/14 border-y border-stone-100/14">
            {content.benefits.map((benefit, i) => (
              <li key={benefit.title} className="flex gap-5 py-5">
                <span aria-hidden className={`${SERIF} w-6 shrink-0 text-2xl leading-none text-accent`}>
                  {i + 1}
                </span>
                <div>
                  <h2 className="text-base font-medium text-stone-100">{benefit.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-stone-100/62">{benefit.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <section aria-labelledby="actie-rooster" className="mt-12">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="actie-rooster" className={`${SERIF} text-2xl text-stone-100`}>
                {content.roosterTitle}
              </h2>
              <span className="text-xs uppercase tracking-[0.16em] text-stone-100/62">
                {shared.roosterLive}
              </span>
            </div>
            {rows.length > 0 ? (
              <ul className="mt-5 overflow-hidden rounded-[8px] bg-[#171412]">
                {rows.map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center gap-4 border-b border-stone-100/14 px-4 py-4 last:border-b-0"
                  >
                    <div className="w-[76px] shrink-0">
                      <div className="text-xs uppercase tracking-[0.08em] text-stone-100/62">
                        {row.day}
                      </div>
                      <div className={`${SERIF} mt-0.5 text-xl leading-none text-stone-100`}>
                        {row.time}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-stone-100">{row.title}</div>
                      <div className="mt-0.5 text-xs text-stone-100/62">{row.duration}</div>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium ${row.status === "few" ? "text-accent" : "text-stone-100/62"}`}
                    >
                      {row.status === "few" ? shared.statusFew : shared.statusFree}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-stone-100/62">{shared.roosterEmpty}</p>
            )}
          </section>

          <p className="mt-10 text-xs leading-relaxed text-stone-100/62">{shared.smallPrint}</p>

          <footer className="mt-10 border-t border-stone-100/14 pt-6 text-xs text-stone-100/62">
            <p>{address}</p>
            <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              <Link
                href="/privacybeleid"
                className={`rounded-[4px] underline underline-offset-4 hover:text-accent ${FOCUS_RING}`}
              >
                {shared.privacy}
              </Link>
              <Link
                href="/voorwaarden"
                className={`rounded-[4px] underline underline-offset-4 hover:text-accent ${FOCUS_RING}`}
              >
                {shared.terms}
              </Link>
            </p>
          </footer>
        </div>
      </main>

      {/* Vaste balk, alleen mobiel en alleen als de knop in de pagina uit
          beeld is. inert zolang hij verborgen is, zodat hij niet in de
          tabvolgorde zit; padding houdt rekening met de home-indicator. */}
      <div
        inert={!showBar}
        aria-hidden={!showBar}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-stone-100/14 bg-ink-900/95 px-4 pt-3 backdrop-blur-sm transition-transform duration-300 min-[900px]:hidden ${showBar ? "translate-y-0" : "translate-y-full"}`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        <div className="flex gap-3">
          <a
            href={startHref}
            onClick={() => pushDataLayer("proefles_cta_click", { variant: "actie_sticky", slug })}
            className={CTA_CLASS}
          >
            {shared.cta}
          </a>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={shared.whatsappAria}
            onClick={onWhatsapp}
            className={`flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[4px] border border-stone-100/14 text-stone-100 transition-colors hover:border-accent hover:text-accent ${FOCUS_RING}`}
          >
            <MessageCircle size={22} strokeWidth={1.5} aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

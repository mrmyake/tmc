"use client";

import { useState } from "react";
import { Copy, Check, MessageCircle } from "lucide-react";
import { trackShare } from "@/lib/analytics";

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

interface Props {
  shareUrl: string;
  shareText: string;
  size?: "sm" | "lg";
}

export function ShareButtons({ shareUrl, shareText, size = "lg" }: Props) {
  const [copied, setCopied] = useState(false);
  const fullText = `${shareText} ${shareUrl}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      trackShare("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no-op */
    }
  }

  const iconSize = size === "lg" ? 20 : 16;
  const padding = size === "lg" ? "px-5 py-3" : "px-4 py-2";

  const waUrl = `https://wa.me/?text=${encodeURIComponent(fullText)}`;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    shareUrl
  )}`;
  const igUrl = `https://www.instagram.com/`;

  return (
    <div className="flex flex-wrap gap-3">
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackShare("whatsapp")}
        className={`inline-flex items-center gap-2 bg-accent text-bg hover:bg-accent-hover ${padding} text-sm font-medium uppercase tracking-[0.15em] transition-colors`}
      >
        <MessageCircle size={iconSize} />
        WhatsApp
      </a>
      <a
        href={fbUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackShare("facebook")}
        className={`inline-flex items-center gap-2 border border-accent text-accent hover:bg-accent hover:text-bg ${padding} text-sm font-medium uppercase tracking-[0.15em] transition-colors`}
      >
        <FacebookIcon size={iconSize} />
        Facebook
      </a>
      <a
        href={igUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackShare("instagram")}
        aria-label="Deel via Instagram"
        className={`inline-flex items-center gap-2 border border-accent text-accent hover:bg-accent hover:text-bg ${padding} text-sm font-medium uppercase tracking-[0.15em] transition-colors`}
      >
        <InstagramIcon size={iconSize} />
        Instagram
      </a>
      <button
        type="button"
        onClick={copyLink}
        className={`inline-flex items-center gap-2 border border-bg-subtle text-text hover:border-accent hover:text-accent ${padding} text-sm font-medium uppercase tracking-[0.15em] transition-colors cursor-pointer`}
      >
        {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
        {copied ? "Gekopieerd" : "Kopieer link"}
      </button>
    </div>
  );
}

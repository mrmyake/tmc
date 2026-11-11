import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // De factuur-PDF (react-pdf) leest Fraunces en Inter van schijf. Zonder
  // deze include neemt Vercel de bestanden niet mee in de serverless bundel,
  // omdat ze alleen via een runtime-pad worden geladen.
  outputFileTracingIncludes: {
    "/app/admin/facturen/**": ["./src/fonts/**"],
    // De factuuracties worden ook vanuit het ledendetail aangeroepen
    // (MaakFactuurKnop), dus daar moet de PDF ook zijn fonts vinden.
    "/app/admin/leden/**": ["./src/fonts/**"],
  },

  async redirects() {
    // De crowdfunding-campagne en daarna de Early Member-campagne zijn
    // allebei voorbij (EM gesloten 2026-11-01, fix/end-early-member-campaign).
    // Permanente redirects naar /prijzen zodat oude links (social, mail,
    // QR, Google-index) blijven werken, rechtstreeks en zonder tussenstap
    // via /early-member.
    return [
      {
        source: "/crowdfunding",
        destination: "/prijzen",
        permanent: true,
      },
      {
        source: "/crowdfunding/:path*",
        destination: "/prijzen",
        permanent: true,
      },
      {
        source: "/early-member",
        destination: "/prijzen",
        permanent: true,
      },
      {
        // WS-4: /app/abonnement/nieuw is vervangen door de publieke
        // /abonnement-configurator. Permanente redirect zodat oude links
        // (bedankt-pagina, bookmarks) blijven werken; een ingelogd lid
        // komt op /abonnement uit met identify overgeslagen.
        source: "/app/abonnement/nieuw",
        destination: "/abonnement",
        permanent: true,
      },
      // Tijdelijke verwijdering van de lead magnet funnel (2026-09-19,
      // chore/remove-lead-magnets). Niet permanent: deze redirects vervallen
      // zodra de funnel terugkomt.
      {
        source: "/beweeg-beter",
        destination: "/proefles",
        permanent: false,
      },
      {
        source: "/beweeg-beter/bedankt",
        destination: "/proefles",
        permanent: false,
      },
      {
        source: "/mobility-reset",
        destination: "/proefles",
        permanent: false,
      },
      {
        source: "/mobility-reset/bedankt",
        destination: "/proefles",
        permanent: false,
      },
      {
        source: "/mobility-check",
        destination: "/proefles",
        permanent: false,
      },
      {
        source: "/mobility-check/bedankt",
        destination: "/proefles",
        permanent: false,
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        pathname: "/images/**",
      },
      {
        // Supabase Storage buckets (avatars, etc.).
        protocol: "https",
        hostname: "xoivleieyfcxcfawgveh.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    // Tree-shake per-icon / per-component ipv barrel-file import.
    // Bespaart ~15-30 KiB gzipped over alle lucide + motion + react-email
    // callsites.
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@react-email/components",
    ],
    // Server actions default body-limit is 1 MB — avatar uploads staan
    // 3 MB toe (smartphone-foto's zitten typisch 2-5 MB). Zonder deze
    // override wordt 1-3 MB stilletjes weggerejected voordat de action
    // zelfs run't; de UI ziet dan een generieke fail zonder error-msg.
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  compiler: {
    // Strip console.log in productie; console.error/warn blijven staan
    // zodat telemetry via Vercel/Sentry werkt.
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
};

export default nextConfig;

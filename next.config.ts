import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
        hostname: "iljyitdazzhalblqetkx.supabase.co",
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
  },
  compiler: {
    // Strip console.log in productie; console.error/warn blijven staan
    // zodat telemetry via Vercel/Sentry werkt.
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
};

export default nextConfig;

import type { Metadata } from "next";
import { HpNotFound } from "@/components/hormoonprofiel/PageView";

// Eigen 404 in de hormoonprofiel-stijl. Next zet op een 404 zelf een
// noindex-robots-tag.
export const metadata: Metadata = {
  title: { absolute: "Pagina niet gevonden | Hormoonprofiel" },
};

export default function NotFound() {
  return <HpNotFound />;
}

import type { Metadata } from "next";
import { BeweegBeterContent } from "./BeweegBeterContent";

export const metadata: Metadata = {
  title: "Beweeg Beter | Gratis Guide: 5 Oefeningen voor Meer Mobiliteit",
  description:
    "Download de gratis Beweeg Beter guide van trainer Marlon. 5 dagelijkse oefeningen voor meer mobiliteit en kracht. Direct in je inbox.",
  alternates: { canonical: "/beweeg-beter" },
};

export default function BeweegBeterPage() {
  return <BeweegBeterContent />;
}

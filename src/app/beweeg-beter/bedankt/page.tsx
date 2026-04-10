import type { Metadata } from "next";
import { BedanktContent } from "./BedanktContent";

export const metadata: Metadata = {
  title: "Je guide is onderweg!",
  robots: { index: false },
};

export default function BedanktPage() {
  return <BedanktContent />;
}

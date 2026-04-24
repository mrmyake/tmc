import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check in · The Movement Club",
  robots: { index: false, follow: false },
};

// Kiosk-modus: geen marketing nav, geen footer. SiteShell slaat de
// hele shell over op basis van pathname (zie layout/SiteShell.tsx).
export const dynamic = "force-dynamic";

export default function CheckinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      {children}
    </div>
  );
}

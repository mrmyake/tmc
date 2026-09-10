import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Fraunces } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import styles from "./kiosk.module.css";

export const metadata: Metadata = {
  title: "Kiosk · The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Fraunces-gewicht 300 (clock, now-time in de mockup) zit niet in de
// site-brede Fraunces-load (src/app/layout.tsx laadt bewust alleen
// 400/500, zie het commentaar daar: "Fraunces needs weight 400+ to stay
// sharp"). Een eigen, aan /kiosk gebonden font-load houdt de rest van de
// site op dat budget en geeft alleen deze route de exacte
// mockup-typografie. Zie de PR-body voor de vraag of gewicht 300 hier
// bewust is, gegeven die eerdere leesbaarheidsafweging.
const kioskSerif = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-kiosk-serif",
  display: "swap",
});

/**
 * Zelfde auth-/rolcheck als /app/trainer/**: ingelogde admin of actieve
 * trainer. Geen eigen auth-laag, geen device-token, geen publieke
 * toegang. Publiek uitgesloten via robots.txt (DISALLOW), net als
 * /checkin. Geen MemberNav, bottom-tabs of marketing-chrome: SiteShell
 * slaat die op basis van pathname over (zie src/components/layout/
 * SiteShell.tsx), zelfde patroon als /checkin daar.
 */
export default async function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // ?next=/kiosk zodat een her-login op de tablet weer op /kiosk landt
  // i.p.v. op de rol-standaard uit roleRedirect() (voor een admin zonder
  // eigen trainers-rij is dat /app/admin, dat AdminMobileBlock geeft op
  // tabletbreedte). Zelfde next-mechanisme als /auth/callback en
  // verifyLoginOtp al ondersteunen voor elke andere expliciete interne
  // route.
  if (!user) redirect("/login?next=/kiosk");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // Admin is een superset en mag hier binnen, zelfde uitzondering als
  // /app/trainer/layout.tsx.
  if (!profile || (profile.role !== "trainer" && profile.role !== "admin")) {
    redirect("/app");
  }

  return (
    <div className={`${styles.kiosk} ${kioskSerif.variable}`}>
      {children}
    </div>
  );
}

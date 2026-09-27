import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Check in · The Movement Club",
  robots: { index: false, follow: false },
};

// Kiosk-modus: geen marketing nav, geen footer. SiteShell slaat de
// hele shell over op basis van pathname (zie layout/SiteShell.tsx).
export const dynamic = "force-dynamic";

/**
 * Zelfde auth-/rolcheck als /kiosk en /app/trainer/**: ingelogde admin of
 * trainer, anders naar /login met next=/checkin zodat de tablet na de
 * login hier terugkomt. Tot fix/checkin-cookie-gate was /checkin publiek
 * met een PIN-scherm en een ongetekend cookie als "sessie"; dat pad is
 * weg. De server actions achter dit scherm doen dezelfde check nog eens
 * via requireTrainerOrAdmin(), deze layout is alleen de nette voorkant.
 */
export default async function CheckinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/checkin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // Admin is een superset en mag hier binnen, zelfde uitzondering als
  // /app/trainer/layout.tsx en /kiosk/layout.tsx.
  if (!profile || (profile.role !== "trainer" && profile.role !== "admin")) {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      {children}
    </div>
  );
}

// TIJDELIJKE TESTPAGINA. Verdwijnt met workstream E3 (ledenscherm voor
// deurtoegang via de app, spec-ios-app.md). Doel: bij de studio de deur
// openen via de Capacitor-plugin uit PR #200 zonder console-commando's,
// met ruwe status- en foutinformatie. Admin-only, niet in de navigatie,
// 404 voor iedere andere rol.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AkilesTestClient } from "./AkilesTestClient";

export const dynamic = "force-dynamic";

export default async function AkilesTestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") notFound();

  return <AkilesTestClient />;
}

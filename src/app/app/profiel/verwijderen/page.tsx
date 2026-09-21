import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { getDeletionPreflight } from "@/lib/member/account-deletion-preflight";
import { DeletionFlow } from "./DeletionFlow";

export const metadata = {
  title: "Account verwijderen | The Movement Club",
  robots: { index: false, follow: false },
};

/**
 * Ledenkant van de accountverwijdering (spec-ios-app.md D.2, PR 3). Een
 * gewone pagina onder /app/profiel, dus bereikbaar in de app en op het
 * web; het recht op verwijdering geldt ongeacht het kanaal. Alles wat
 * hier getoond wordt komt uit de cookie-client van het lid (RLS
 * self-read); de mutaties lopen via src/lib/actions/account-deletion.ts.
 */
export default async function VerwijderenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .maybeSingle();

  const preflight = await getDeletionPreflight(supabase, user.id);

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <Link
        href="/app/profiel"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors mb-10"
      >
        <ChevronLeft size={14} strokeWidth={1.5} />
        {/* COPY: confirm met Marlon */}
        Profiel
      </Link>

      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          {/* COPY: confirm met Marlon */}
          Account verwijderen
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          {/* COPY: confirm met Marlon */}
          Je account, jouw keuze.
        </h1>
      </header>

      {profile?.role && profile.role !== "member" ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-sm leading-relaxed max-w-md">
          Dit is een teamaccount. Verwijderen loopt via Marlon; neem contact op.
        </p>
      ) : (
        <DeletionFlow preflight={preflight} email={profile?.email ?? user.email ?? ""} />
      )}
    </Container>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { getAccessSummary } from "@/lib/access/summary";
import { ToegangClient } from "./ToegangClient";

export const metadata = {
  title: "Toegang | The Movement Club",
  robots: { index: false, follow: false },
};

/**
 * Ledenscherm voor deurtoegang via de app (workstream E3,
 * spec-akiles-access.md). Vervangt de tijdelijke testpagina uit PR #201.
 *
 * De toegangsvoorwaarde is het bestaande toegangsmodel: getAccessSummary
 * leest tmc.access_credentials, en die rij wordt uitsluitend door de sync
 * gevuld vanuit resolveDesiredAccess (alleen abonnementsrijen, geen
 * rittenkaart of PT-pakket). Alleen bij "active" krijgt het lid het
 * koppelscherm; die toestand is dezelfde die issueDeviceTokenCore
 * server-side opnieuw controleert. Geen tweede definitie hier.
 */
export default async function ToegangPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const summary = await getAccessSummary(user.id);

  return (
    <Container className="py-16 md:py-20 max-w-xl">
      <header className="mb-10">
        {/* COPY: confirm met Marlon */}
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Deurtoegang
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Toegang.
        </h1>
      </header>

      {summary.state === "active" ? (
        <ToegangClient />
      ) : (
        <NoAccess expired={summary.state === "expired"} />
      )}
    </Container>
  );
}

function NoAccess({ expired }: { expired: boolean }) {
  return (
    <section className="relative bg-bg-elevated p-6 md:p-8">
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
      />
      <div className="w-14 h-14 rounded-full bg-bg flex items-center justify-center mb-6">
        <Lock size={22} strokeWidth={1.5} className="text-text-muted" aria-hidden />
      </div>
      {/* COPY: confirm met Marlon */}
      <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.1] tracking-[-0.02em] mb-4">
        Geen deurtoegang
      </h2>
      {expired ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-sm leading-relaxed mb-3">
          Je deurtoegang is op dit moment niet actief. Zodra je abonnement
          weer loopt, kun je dit toestel koppelen.
        </p>
      ) : (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-sm leading-relaxed mb-3">
          Deurtoegang via de app is onderdeel van een abonnement.
          Rittenkaarten en PT-pakketten geven geen zelfstandige toegang: voor
          die sessies sta je samen met je trainer binnen.
        </p>
      )}
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm leading-relaxed mb-8">
        Heb je vragen over je abonnement? Neem contact op met de studio.
      </p>
      <Link
        href="/app/abonnement"
        className="inline-flex w-full min-h-14 items-center justify-center px-6 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text hover:border-accent hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
      >
        {/* COPY: confirm met Marlon */}
        Bekijk abonnementen
      </Link>
    </section>
  );
}

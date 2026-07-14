import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Personal training | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * PT-agenda C1 (model-herziening): PT wordt volledig door Marlon
 * ingepland, er is geen zelfbedienings-boekflow meer. Deze pagina is de
 * informatieve landing achter de "PT"-ingang in het Meer-menu; de eigen
 * geboekte PT-sessies verschijnen in /app/boekingen (PR E).
 */
export default async function PtPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Personal training
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Persoonlijk ingepland.
        </h1>
        {/* COPY: confirm met Marlon */}
        <p className="mt-6 text-text-muted text-lg max-w-xl">
          Personal training plannen we samen. Marlon boekt jouw sessies op
          momenten die voor jou werken, afgestemd op jouw traject.
        </p>
      </header>

      <section className="bg-bg-elevated p-8 md:p-10 mb-10">
        {/* COPY: confirm met Marlon */}
        <p className="text-text text-base leading-relaxed mb-4">
          Wil je een sessie plannen, verzetten of een traject starten? Stuur
          Marlon een bericht en het staat zo in je agenda.
        </p>
        <p className="text-text-muted text-base leading-relaxed">
          Je geboekte PT-sessies vind je terug bij je boekingen.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button href="/app/boekingen">Mijn boekingen</Button>
        <Button href="/app/support" variant="secondary">
          Neem contact op
        </Button>
      </div>

      <p className="mt-10 text-text-muted text-sm">
        {/* COPY: confirm met Marlon */}
        Meer weten over het 12-weken programma?{" "}
        <Link href="/12-weken-programma" className="underline" target="_blank">
          Bekijk het programma
        </Link>
        .
      </p>
    </Container>
  );
}

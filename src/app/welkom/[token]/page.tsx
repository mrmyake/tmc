import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { isValidLoginToken } from "@/lib/checkout/welcome-login-core";
import { sha256Hex } from "@/lib/checkout/token-hash";
import { LoginForm } from "@/app/login/LoginForm";
import { WelcomeLoginForm } from "./WelcomeLoginForm";

export const metadata: Metadata = {
  title: "Welkom | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type LinkState =
  | { kind: "valid"; email: string | null; firstName: string | null }
  | { kind: "used" | "expired" | "unknown"; email: string | null };

/**
 * Leest de intent op de hash van het inlogtoken, zonder iets te
 * verbruiken: dit is de GET die ook mailscanners doen. Alleen status,
 * gebruik en expiry van het token, plus e-mail en voornaam uit het profiel
 * voor "Je logt in als". Geen tokens in de respons.
 */
async function readLinkState(token: string): Promise<LinkState> {
  if (!isValidLoginToken(token) || !isAdminConfigured()) return { kind: "unknown", email: null };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("checkout_intents")
    .select(
      "status, login_token_used_at, login_token_expires_at, profile:profiles!checkout_intents_profile_id_fkey(email, first_name)",
    )
    .eq("login_token_hash", sha256Hex(token))
    .maybeSingle();
  if (error || !data) return { kind: "unknown", email: null };
  const row = data as unknown as {
    status: string;
    login_token_used_at: string | null;
    login_token_expires_at: string | null;
    profile: { email: string | null; first_name: string | null } | { email: string | null; first_name: string | null }[] | null;
  };
  const profile = Array.isArray(row.profile) ? (row.profile[0] ?? null) : row.profile;
  const email = profile?.email ?? null;
  if (row.login_token_used_at) return { kind: "used", email };
  if (!row.login_token_expires_at || new Date(row.login_token_expires_at) < new Date()) {
    return { kind: "expired", email };
  }
  if (row.status !== "converted") return { kind: "unknown", email };
  return { kind: "valid", email, firstName: profile?.first_name ?? null };
}

// Bewust niet achter CHECKOUT_GUEST_ENABLED: een lid met een geldige link uit
// de welkomstmail moet ook na het uitzetten van de vlag kunnen inloggen. De
// pagina doet alleen iets met een geldig token.
export default async function WelkomPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await readLinkState(token);

  if (state.kind === "valid") {
    // Scherm 8 (mockups/checkout-betalen-voor-account.html).
    return (
      <section className="min-h-screen flex items-center py-20">
        <Container>
          <div className="max-w-md mx-auto">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              {/* COPY: confirm met Marlon */}
              Welkom bij The Movement Club
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
              {/* COPY: confirm met Marlon */}
              Hé {state.firstName || "daar"}, je account staat klaar.
            </h1>
            <p className="text-text-muted mb-8">
              {/* COPY: confirm met Marlon */}
              Druk op de knop om in te loggen. Je komt dan direct in je
              ledenomgeving, waar je rooster, boekingen en abonnement staan.
            </p>
            <WelcomeLoginForm token={token} />
            {state.email && (
              <p className="text-text-muted text-sm mt-5">
                {/* COPY: confirm met Marlon */}
                Je logt in als <span className="text-text">{state.email}</span>. Niet jouw
                adres?{" "}
                <Link href="/contact" className="text-accent hover:underline">
                  Neem contact op
                </Link>
                .
              </p>
            )}
          </div>
        </Container>
      </section>
    );
  }

  // Scherm 9: verlopen, gebruikt of onbekend. Bestaand OTP-formulier,
  // e-mail voorgevuld als de intent herkend is.
  return (
    <section className="min-h-screen flex items-center py-20">
      <Container>
        <div className="max-w-md mx-auto">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            {/* COPY: confirm met Marlon */}
            Inloggen
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
            {/* COPY: confirm met Marlon */}
            Deze link werkt niet meer.
          </h1>
          <p className="text-text-muted mb-8">
            {/* COPY: confirm met Marlon */}
            {state.kind === "used"
              ? "Je inloglink is al gebruikt. Geen probleem: vraag hieronder een inlogcode aan, die sturen we direct naar je mail."
              : "Je inloglink is verlopen of niet meer geldig. Geen probleem: vraag hieronder een inlogcode aan, die sturen we direct naar je mail."}
          </p>
          <LoginForm initialEmail={state.email ?? undefined} />
          <p className="text-text-muted text-sm mt-6">
            {/* COPY: confirm met Marlon */}
            Je account en je abonnement zijn er gewoon; alleen de link is op.
            Lukt het niet?{" "}
            <Link href="/contact" className="text-accent hover:underline">
              Neem contact op
            </Link>
            .
          </p>
        </div>
      </Container>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Inloggen | The Movement Club",
  description: "Log in bij The Movement Club met een magic link.",
  robots: { index: false, follow: false },
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link:
    "Deze inloglink is verlopen of al gebruikt. Vraag een nieuwe aan.",
  no_code: "Geen inlog-code ontvangen. Probeer opnieuw.",
  unknown: "Er ging iets mis tijdens het inloggen. Probeer opnieuw.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorKey = params.error;
  const initialError = errorKey
    ? ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.unknown
    : undefined;

  // Already authenticated? Send straight to the member app. Keeps the
  // "Inloggen" link in the marketing navbar doing the right thing for
  // both states without requiring an auth-aware navbar.
  if (!errorKey) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/app");
  }

  return (
    <section className="min-h-screen flex items-center py-20">
      <Container>
        <div className="max-w-md mx-auto">
          <Link
            href="/"
            className="inline-block text-xs uppercase tracking-[0.25em] text-text-muted hover:text-accent mb-8 transition-colors"
          >
            ← The Movement Club
          </Link>

          <div className="mb-8 text-center">
            <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
              Member login
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-tight">
              Welkom terug
            </h1>
          </div>

          <LoginForm initialError={initialError} />
        </div>
      </Container>
    </section>
  );
}

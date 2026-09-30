import Link from "next/link";
import { Confetti } from "@/components/ui/Confetti";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { StatusPoller } from "@/components/checkout/StatusPoller";
import { PaymentTracker } from "@/components/checkout/PaymentTracker";
import { RetryPaymentButton } from "@/components/checkout/RetryPaymentButton";
import { getCheckoutIntentStatus } from "@/lib/orders/status-actions";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/checkout/token-hash";
import { SITE } from "@/lib/constants";

/**
 * Publieke bedankpagina van de gastcheckout (/abonnement/bedankt en
 * /kopen/bedankt, schermen 5, 6 en 7 van
 * mockups/checkout-betalen-voor-account.html). Het status-token uit ?t=
 * geeft via checkout_intent_status alleen status, paid, paid_but_failed en
 * e-mail; het levert nooit een sessie op. Vier toestanden:
 *
 *  - converted: scherm 5, "Check je mail" met de drie vinkjes.
 *  - draft/pending: scherm 6 boven, "We verwerken je betaling" met poller.
 *  - cancelled/expired, of failed zonder paid: scherm 6 onder, "Er is niets
 *    afgeschreven" met Opnieuw proberen (alleen zolang niet verlopen).
 *  - failed met paid: scherm 7, "We ronden je aanmelding persoonlijk af".
 */
const TOKEN_RE = /^[0-9a-f]{64}$/;

interface IntentStatus {
  status: string;
  paid: boolean;
  paidButFailed: boolean;
  email: string | null;
}

async function readStatus(token: string | undefined): Promise<IntentStatus | null> {
  if (!token || !TOKEN_RE.test(token) || !isAdminConfigured()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("checkout_intent_status", { p_status_token: token });
  if (error) return null;
  const r = data as { status?: string; paid?: boolean; paid_but_failed?: boolean; email?: string | null } | null;
  if (!r?.status || r.status === "not_found") return null;
  return {
    status: r.status,
    paid: Boolean(r.paid),
    paidButFailed: Boolean(r.paid_but_failed),
    email: r.email ?? null,
  };
}

export async function GuestThanks({
  kind,
  token,
}: {
  kind: "subscription" | "product";
  token: string | undefined;
}) {
  const intent = await readStatus(token);
  const contactEmail = SITE.email;

  if (!intent || !token) {
    return (
      <Container className="py-20 max-w-2xl text-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-6">
          {/* COPY: confirm met Marlon */}
          Aanmelding
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-5 leading-tight">
          {/* COPY: confirm met Marlon */}
          Deze pagina hoort bij een aanmelding.
        </h1>
        <p className="text-text-muted text-lg leading-relaxed mb-10">
          {/* COPY: confirm met Marlon */}
          We kunnen er geen aanmelding bij vinden. Heb je net betaald, kijk dan
          in je mail: daar staat je inloglink. Wil je je aanmelden, dan kan dat
          hieronder.
        </p>
        <Button href={kind === "subscription" ? "/abonnement" : "/kopen"}>
          {/* COPY: confirm met Marlon */}
          {kind === "subscription" ? "Kies je abonnement" : "Naar het aanbod"}
        </Button>
      </Container>
    );
  }

  const pending = intent.status === "draft" || intent.status === "pending";
  const converted = intent.status === "converted";
  const paidButFailed = intent.status === "failed" && intent.paidButFailed;
  const aborted = !pending && !converted && !paidButFailed;
  const trackerId = sha256Hex(token);
  const productLabel = kind === "subscription" ? "je abonnement" : "je tegoed";

  return (
    <>
      {converted && <Confetti />}
      <PaymentTracker status={intent.status} transactionId={trackerId} />
      <Container className="py-20 max-w-2xl">
        {converted && (
          <>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              {/* COPY: confirm met Marlon */}
              Welkom bij The Movement Club
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-4 leading-tight">
              {/* COPY: confirm met Marlon */}
              Check je mail.
            </h1>
            <p className="text-text-muted text-lg leading-relaxed mb-8">
              {/* COPY: confirm met Marlon */}
              Je betaling is gelukt en je account staat klaar. We hebben je inloglink
              gestuurd naar <span className="text-text">{intent.email ?? "je e-mailadres"}</span>.
              Klik op de link in die mail om in te loggen; hij is 7 dagen geldig.
            </p>
            <Checklist items={[["done", "Betaling ontvangen"], ["done", "Account aangemaakt"], ["done", "Inloglink verstuurd"]]} />
            <InfoBox title="Geen mail gekregen?">
              {/* COPY: confirm met Marlon */}
              Kijk in je spam. Verkeerd adres ingevuld? Stuur een berichtje naar{" "}
              <a href={`mailto:${contactEmail}`} className="text-text">{contactEmail}</a> of via
              WhatsApp, dan zetten we het recht. Je betaling is veilig gekoppeld aan je
              aanmelding.
            </InfoBox>
            <Button href="/" variant="secondary">
              {/* COPY: confirm met Marlon */}
              Naar de homepage
            </Button>
          </>
        )}

        {pending && (
          <>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              {/* COPY: confirm met Marlon */}
              Bijna klaar
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-4 leading-tight">
              {/* COPY: confirm met Marlon */}
              We verwerken je betaling.
            </h1>
            <p className="text-text-muted text-lg leading-relaxed mb-8">
              {/* COPY: confirm met Marlon */}
              Dit duurt meestal een paar seconden. Zodra het klaar is, sturen we je
              inloglink naar <span className="text-text">{intent.email ?? "je e-mailadres"}</span>.
              Je kunt deze pagina open laten.
            </p>
            <Checklist items={[["done", "Betaling ontvangen"], ["busy", "Account aanmaken"], ["todo", "Inloglink versturen"]]} />
            <StatusPoller
              check={getCheckoutIntentStatus.bind(null, token)}
              // COPY: confirm met Marlon
              pendingLabel="Bezig met verwerken..."
            />
          </>
        )}

        {paidButFailed && (
          <>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              {/* COPY: confirm met Marlon */}
              Je betaling is binnen
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-4 leading-tight">
              {/* COPY: confirm met Marlon */}
              We ronden je aanmelding persoonlijk af.
            </h1>
            <p className="text-text-muted text-lg leading-relaxed mb-8">
              {/* COPY: confirm met Marlon */}
              Je betaling is ontvangen, maar het aanmaken van je account is bij ons niet
              automatisch gelukt. Dat lossen we voor je op: we nemen binnen één werkdag
              contact met je op via{" "}
              <span className="text-text">{intent.email ?? "je e-mailadres"}</span>.
            </p>
            <Checklist items={[["done", "Betaling ontvangen"], ["alert", "Account aanmaken: dit doen we handmatig voor je"], ["todo", "Inloglink volgt per mail"]]} />
            <InfoBox title="Liever zelf even bellen of appen?">
              {/* COPY: confirm met Marlon */}
              Mail naar <a href={`mailto:${contactEmail}`} className="text-text">{contactEmail}</a>{" "}
              of stuur een WhatsApp. Je hoeft niets opnieuw te betalen.
            </InfoBox>
          </>
        )}

        {aborted && (
          <>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              {/* COPY: confirm met Marlon */}
              Betaling afgebroken of geweigerd
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-4 leading-tight">
              {/* COPY: confirm met Marlon */}
              Er is niets afgeschreven.
            </h1>
            <p className="text-text-muted text-lg leading-relaxed mb-8">
              {/* COPY: confirm met Marlon */}
              Je hebt de betaling afgebroken, of je bank heeft hem geweigerd. Er is geen
              account aangemaakt.{" "}
              {intent.status === "expired"
                ? `Je aanmelding is intussen verlopen; begin opnieuw als je ${productLabel} alsnog wilt.`
                : "Je kunt het opnieuw proberen; je gegevens staan nog klaar."}
            </p>
            <div className="flex items-center gap-6">
              {intent.status !== "expired" && intent.status !== "failed" && (
                <RetryPaymentButton token={token} />
              )}
              <Link
                href={kind === "subscription" ? "/abonnement" : "/kopen"}
                className="text-xs uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors"
              >
                {/* COPY: confirm met Marlon */}
                {intent.status === "expired" ? "Opnieuw beginnen" : "Terug naar het aanbod"}
              </Link>
            </div>
          </>
        )}
      </Container>
    </>
  );
}

function Checklist({ items }: { items: Array<["done" | "busy" | "todo" | "alert", string]> }) {
  return (
    <ul className="mb-8 space-y-3">
      {items.map(([state, label]) => (
        <li key={label} className="flex items-center gap-3 text-sm text-text-muted">
          <span
            aria-hidden
            className={`inline-grid h-6 w-6 place-items-center rounded-full border text-[11px] ${
              state === "done"
                ? "border-accent/50 bg-accent/10 text-accent"
                : state === "alert"
                  ? "border-[color:var(--danger)]/50 text-[color:var(--danger)]"
                  : "border-bg-subtle text-transparent"
            }`}
          >
            {state === "done" ? "✓" : state === "alert" ? "!" : state === "busy" ? (
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            ) : ""}
          </span>
          <span className={state === "done" ? "text-text" : ""}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

function InfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 border border-accent/30 bg-bg-elevated p-6">
      <div className="text-accent text-xs font-medium uppercase tracking-[0.25em] mb-3">{title}</div>
      <p className="text-text-muted text-sm leading-relaxed">{children}</p>
    </div>
  );
}

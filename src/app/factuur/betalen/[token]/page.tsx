import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { StatusPoller } from "@/components/checkout/StatusPoller";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { SITE } from "@/lib/constants";
import { getSiteSettings } from "../../../../../sanity/lib/fetch";
import { onlinePaymentAvailable } from "@/lib/invoice-payments/availability";
import { resolvePaymentDetails } from "@/lib/invoice-terms";
import { formatEuroCentsSigned } from "@/lib/format";
import { formatNlDate, invoiceDueDate } from "@/lib/invoice-terms";
import { isValidPayToken } from "@/lib/invoice-payments/pay-url";
import {
  INVOICE_STATUS_LABEL,
  canPayOnline,
  invoicePaymentStatus,
  todayIso,
} from "@/lib/invoice-payments/status";
import { creditedCentsByInvoice } from "@/lib/invoice-payments/server";
import { getInvoicePayStatus } from "@/lib/invoice-payments/start-payment";
import { PayButton } from "./PayButton";

export const metadata = {
  title: "Factuur betalen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Publieke betaalpagina van een factuur (spec-facturatie.md 9.7). Het token
 * (uuid, uniek op tmc.invoice_pay_tokens) is de enige poort; geen login. De
 * pagina toont alleen studionaam, factuurnummer, bedrag, vervaldatum en
 * status: nooit naam, adres of e-mail van de afnemer. Een onbekend token is
 * een kale 404. Een vervallen factuur blijft betaalbaar.
 */
export default async function FactuurBetalenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidPayToken(token) || !isAdminConfigured()) notFound();

  const admin = createAdminClient();
  const { data: tokenRow } = await admin
    .from("invoice_pay_tokens")
    .select("invoice_id")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) notFound();

  const { data: inv } = await admin
    .from("invoices")
    .select(
      "id, invoice_number, status, is_test, issued_at, total_gross_cents, payment_id, credit_of_invoice_id",
    )
    .eq("id", tokenRow.invoice_id)
    .maybeSingle();
  if (
    !inv ||
    inv.status !== "finalised" ||
    inv.credit_of_invoice_id ||
    !inv.invoice_number ||
    !inv.issued_at
  ) {
    notFound();
  }

  const credited = (await creditedCentsByInvoice([inv.id])).get(inv.id) ?? 0;
  const total = inv.total_gross_cents ?? 0;
  const status = invoicePaymentStatus({
    isCreditNote: false,
    totalGrossCents: total,
    creditedCents: credited,
    paid: inv.payment_id !== null,
    issuedAt: inv.issued_at,
    today: todayIso(),
  });
  const payable = canPayOnline({
    status: inv.status,
    isCreditNote: false,
    totalGrossCents: total,
    paymentId: inv.payment_id,
    creditedCents: credited,
  });

  // Terug van Mollie kan de webhook nog onderweg zijn: kijk naar de laatste
  // poging zelf, zodat de klant meteen "ontvangen" ziet.
  let processing = false;
  if (payable) {
    const { data: attempts } = await admin
      .from("payments")
      .select("mollie_payment_id, status")
      .eq("invoice_id", inv.id)
      .eq("kind", "invoice")
      .not("mollie_payment_id", "like", "bank:%")
      .order("created_at", { ascending: false })
      .limit(1);
    const last = attempts?.[0];
    if (last && ["open", "pending", "authorized", "paid"].includes(last.status)) {
      try {
        const mollie = getMollieClient(inv.is_test ? "test" : "live");
        const p = mollie ? await mollie.payments.get(last.mollie_payment_id) : null;
        if (p && ["paid", "pending", "authorized"].includes(p.status)) processing = true;
      } catch {
        // Status onbekend: toon gewoon de betaalstaat; de action hervalideert.
      }
    }
  }

  const dueLabel = formatNlDate(invoiceDueDate(inv.issued_at));

  // Staat de Mollie-modus van deze factuur in deze omgeving niet aan (een
  // LIVE-factuur op een preview), dan geen knop maar een duidelijke tekst met
  // de overmaakgegevens. De generieke foutmelding blijft voor echte fouten.
  const unavailable = payable && !onlinePaymentAvailable(inv.is_test);
  const settings = unavailable ? await getSiteSettings() : null;
  const transfer = settings
    ? resolvePaymentDetails(settings.iban, SITE)
    : null;

  // COPY: confirm met Marlon
  const COPY = processing
    ? {
        eyebrow: "Bijna klaar",
        title: "Je betaling is ontvangen.",
        body: "We verwerken hem nu. Dit duurt meestal maar een paar minuten; je hoeft niets meer te doen.",
      }
    : status === "betaald"
      ? {
          eyebrow: "Gelukt",
          title: "Deze factuur is betaald.",
          body: "Bedankt. Je hoeft niets meer te doen.",
        }
      : status === "gecrediteerd"
        ? {
            eyebrow: "Gecrediteerd",
            title: "Deze factuur is gecrediteerd.",
            body: "Er is niets te betalen.",
          }
        : {
            eyebrow: "Factuur",
            title: `Factuur ${inv.invoice_number}`,
            body: unavailable
              ? "Online betalen is in deze omgeving niet beschikbaar. Je kunt de factuur wel zelf overmaken."
              : status === "vervallen"
                ? "De betaaltermijn van deze factuur is verstreken. Je kunt hem nog steeds hieronder betalen."
                : "Controleer de gegevens en rond de betaling af via Mollie.",
          };

  return (
    <main className="min-h-screen bg-bg">
      <Container className="py-24 max-w-2xl text-center">
        <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
          {COPY.eyebrow}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-5 leading-tight">
          {COPY.title}
        </h1>
        <p className="text-text-muted text-lg leading-relaxed mb-10">{COPY.body}</p>

        {processing && (
          <StatusPoller
            check={getInvoicePayStatus.bind(null, token)}
            // COPY: confirm met Marlon
            pendingLabel="We wachten op de bevestiging van Mollie..."
          />
        )}

        <div className="inline-block w-full max-w-md bg-bg-elevated border border-bg-subtle px-8 py-6 mb-8 text-left">
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-2">
            {SITE.name}
          </div>
          <div className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-4">
            Factuur {inv.invoice_number}
          </div>
          <div className="flex justify-between text-sm text-text mb-1">
            <span>Bedrag</span>
            <span>{formatEuroCentsSigned(total)}</span>
          </div>
          <div className="flex justify-between text-sm text-text-muted mb-1">
            <span>Vervaldatum</span>
            <span>{dueLabel}</span>
          </div>
          {status && (
            <div className="flex justify-between text-sm text-text-muted">
              <span>Status</span>
              <span>{processing ? INVOICE_STATUS_LABEL.open : INVOICE_STATUS_LABEL[status]}</span>
            </div>
          )}
        </div>

        {unavailable && transfer && (
          <div className="inline-block w-full max-w-md bg-bg-elevated border border-bg-subtle px-8 py-6 mb-8 text-left">
            {/* COPY: confirm met Marlon */}
            <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-3">
              Zelf overmaken
            </div>
            <dl className="text-sm text-text grid grid-cols-[6rem_1fr] gap-y-1">
              <dt className="text-text-muted">IBAN</dt>
              <dd>{transfer.iban}</dd>
              <dt className="text-text-muted">T.n.v.</dt>
              <dd>{transfer.accountHolder}</dd>
              <dt className="text-text-muted">Kenmerk</dt>
              <dd>{inv.invoice_number}</dd>
              <dt className="text-text-muted">Uiterlijk</dt>
              <dd>{dueLabel}</dd>
            </dl>
          </div>
        )}

        {payable && !processing && !unavailable && (
          <>
            <PayButton token={token} />
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-xs mt-6">
              Betalen gaat veilig via Mollie.
            </p>
          </>
        )}
      </Container>
    </main>
  );
}

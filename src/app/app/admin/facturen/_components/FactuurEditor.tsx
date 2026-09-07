"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveInvoiceLines,
  deleteInvoiceDraft,
  finalizeInvoice,
  generateInvoicePdf,
  sendInvoiceEmail,
  createCreditNote,
} from "@/lib/admin/invoice-actions";
import { getInvoiceDownloadUrl } from "@/lib/member/invoice-actions";
import { formatEuro } from "@/lib/format";

/**
 * Concept-editor plus de drie stappen (9.3/9.4/9.5). Bruto wordt ingevoerd
 * (dat is wat iemand voor zich heeft); netto en BTW rekenen live mee
 * volgens 3.1. Het tarief is een keuzelijst per regel (9, 21, 0 procent),
 * default uit de catalogusrij, met een zichtbare markering zodra het
 * afwijkt. Wijzigingen slaan nooit terug op de catalogus.
 *
 * Finaliseren is het enige onherroepelijke punt in het systeem en krijgt
 * daarom een expliciete bevestigingsstap die bedrag en afnemer noemt: een
 * misklik kost een nummer dat alleen met een creditnota te herstellen is.
 */

const VAT_OPTIONS = [
  { bp: 900, label: "9%" },
  { bp: 2100, label: "21%" },
  { bp: 0, label: "0%" },
];

function splitGross(grossCents: number, vatRateBp: number) {
  const sign = grossCents < 0 ? -1 : 1;
  const abs = Math.abs(grossCents);
  const vat = Math.round((abs * vatRateBp) / (10000 + vatRateBp));
  return { netCents: sign * (abs - vat), vatCents: sign * vat };
}

export interface EditorLine {
  lineNo: number;
  catalogueSlug: string | null;
  description: string;
  quantity: number;
  grossCents: number;
  vatRateBp: number;
  revenueCategory: string | null;
}

export interface CatalogueOption {
  slug: string;
  displayName: string;
  grossCents: number;
  vatRateBp: number;
}

interface FactuurEditorProps {
  invoice: {
    id: string;
    number: string | null;
    status: string;
    isTest: boolean;
    issuedAt: string | null;
    isCreditNote: boolean;
    creditOfNumber: string | null;
    pdfPath: string | null;
    totalGrossCents: number | null;
    billToName: string;
    billToEmail: string;
  };
  initialLines: EditorLine[];
  catalogueOptions: CatalogueOption[];
}

function euroInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Komma en punt allebei toegestaan als decimaalscheiding (NL toetsenbord
 * typt komma). Staan beide in de invoer, dan is de LAATSTE de
 * decimaalscheiding en is de andere een duizendtal-scheiding (dekt zowel
 * "1.234,56" als "1,234.56"). Nooit een spinner-input: die is onwerkbaar
 * voor bedragen en levert bovendien geen komma-invoer. Ongeldige invoer
 * valt terug op 0, net als de bestaande `Number(...) || 0`-aanpak elders
 * in dit scherm. */
function parseDecimalInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = trimmed.replace(/,/g, "");
  } else {
    normalized = trimmed;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function FactuurEditor({
  invoice,
  initialLines,
  catalogueOptions,
}: FactuurEditorProps) {
  const router = useRouter();
  const isDraft = invoice.status === "draft";
  const [lines, setLines] = useState<EditorLine[]>(initialLines);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(() => {
    let net = 0;
    let gross = 0;
    const vatByRate = new Map<number, number>();
    for (const l of lines) {
      const { netCents, vatCents } = splitGross(l.grossCents, l.vatRateBp);
      net += netCents;
      gross += l.grossCents;
      vatByRate.set(l.vatRateBp, (vatByRate.get(l.vatRateBp) ?? 0) + vatCents);
    }
    return { net, gross, vatByRate };
  }, [lines]);

  const defaultRateBySlug = useMemo(
    () => new Map(catalogueOptions.map((c) => [c.slug, c.vatRateBp])),
    [catalogueOptions],
  );

  function updateLine(i: number, patch: Partial<EditorLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addCatalogueLine(slug: string) {
    const opt = catalogueOptions.find((c) => c.slug === slug);
    if (!opt) return;
    setLines((prev) => [
      ...prev,
      {
        lineNo: prev.length + 1,
        catalogueSlug: opt.slug,
        description: opt.displayName,
        quantity: 1,
        grossCents: opt.grossCents,
        vatRateBp: opt.vatRateBp,
        revenueCategory: null,
      },
    ]);
  }

  function addFreeLine() {
    setLines((prev) => [
      ...prev,
      {
        lineNo: prev.length + 1,
        catalogueSlug: null,
        description: "",
        quantity: 1,
        grossCents: 0,
        // Vrije regel: default 9 procent, het tarief van vrijwel alles wat
        // TMC verkoopt (9.3); net zo goed te wijzigen.
        vatRateBp: 900,
        revenueCategory: null,
      },
    ]);
  }

  function removeLine(i: number) {
    setLines((prev) =>
      prev.filter((_, j) => j !== i).map((l, j) => ({ ...l, lineNo: j + 1 })),
    );
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const r = await saveInvoiceLines(invoice.id, lines);
      // COPY: confirm met Marlon
      setMessage(r.ok ? "Regels opgeslagen." : r.error);
      if (r.ok) router.refresh();
    });
  }

  function runDelete() {
    setConfirmDelete(false);
    setMessage(null);
    startTransition(async () => {
      const r = await deleteInvoiceDraft(invoice.id);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      router.push("/app/admin/facturen");
    });
  }

  function runFinalize() {
    setConfirmFinalize(false);
    setMessage(null);
    startTransition(async () => {
      const r = await finalizeInvoice(invoice.id);
      // COPY: confirm met Marlon
      setMessage(
        r.ok ? `Gefinaliseerd als ${r.invoiceNumber}.` : r.error,
      );
      if (r.ok) router.refresh();
    });
  }

  function runPdf() {
    setMessage(null);
    startTransition(async () => {
      const r = await generateInvoicePdf(invoice.id);
      // COPY: confirm met Marlon
      setMessage(r.ok ? "PDF gegenereerd en opgeslagen." : r.error);
      if (r.ok) router.refresh();
    });
  }

  function runSend() {
    setMessage(null);
    startTransition(async () => {
      const r = await sendInvoiceEmail(invoice.id);
      // COPY: confirm met Marlon
      setMessage(r.ok ? "Mail verstuurd." : r.error);
    });
  }

  function runCredit() {
    setMessage(null);
    startTransition(async () => {
      const r = await createCreditNote(invoice.id);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      router.push(`/app/admin/facturen/${r.invoiceId}`);
    });
  }

  function download() {
    setMessage(null);
    startTransition(async () => {
      const r = await getInvoiceDownloadUrl(invoice.id);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {invoice.isCreditNote ? "Creditnota" : "Factuur"}
          {invoice.isTest && " · TEST"}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl text-text tracking-[-0.02em]">
          {invoice.number ?? "Concept"}
        </h1>
        <p className="text-text-muted text-sm mt-2">
          {invoice.billToName} · {invoice.billToEmail}
          {invoice.creditOfNumber && (
            <> · creditnota bij {invoice.creditOfNumber}</>
          )}
          {invoice.issuedAt && <> · {invoice.issuedAt}</>}
        </p>
      </header>

      {/* Regels */}
      <section className="flex flex-col gap-3">
        <h2 className="tmc-eyebrow">Regels</h2>
        {lines.map((l, i) => {
          const { netCents, vatCents } = splitGross(l.grossCents, l.vatRateBp);
          const defaultRate = l.catalogueSlug
            ? defaultRateBySlug.get(l.catalogueSlug)
            : undefined;
          const deviates =
            defaultRate !== undefined && defaultRate !== l.vatRateBp;
          return (
            <div
              key={i}
              className="grid grid-cols-[1fr_90px_110px_90px_auto] gap-3 items-start bg-bg-elevated p-3"
            >
              <div className="flex flex-col gap-1">
                <input
                  disabled={!isDraft}
                  value={l.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  // COPY: confirm met Marlon
                  placeholder="Omschrijving"
                  className="bg-transparent border-b border-[color:var(--ink-500)]/60 text-sm text-text py-1"
                />
                <span className="text-text-muted text-[10px]">
                  {l.catalogueSlug ?? "vrije regel"} · netto{" "}
                  {formatEuro(Math.round(netCents / 100))} · BTW{" "}
                  {formatEuro(Math.round(vatCents / 100))}
                </span>
              </div>
              <input
                disabled={!isDraft}
                type="text"
                inputMode="decimal"
                value={l.quantity}
                onChange={(e) =>
                  updateLine(i, { quantity: parseDecimalInput(e.target.value) })
                }
                className="bg-transparent border-b border-[color:var(--ink-500)]/60 text-sm text-text py-1 text-right"
                aria-label="Aantal"
              />
              <input
                disabled={!isDraft}
                type="text"
                inputMode="decimal"
                value={euroInput(l.grossCents)}
                onChange={(e) =>
                  updateLine(i, {
                    grossCents: Math.round(parseDecimalInput(e.target.value) * 100),
                  })
                }
                className="bg-transparent border-b border-[color:var(--ink-500)]/60 text-sm text-text py-1 text-right"
                aria-label="Bedrag incl. BTW"
              />
              <div className="flex flex-col gap-0.5">
                <select
                  disabled={!isDraft}
                  value={l.vatRateBp}
                  onChange={(e) =>
                    updateLine(i, { vatRateBp: Number(e.target.value) })
                  }
                  className="bg-bg border border-[color:var(--ink-500)]/60 text-sm text-text py-1 px-2"
                  aria-label="BTW-tarief"
                >
                  {VAT_OPTIONS.map((o) => (
                    <option key={o.bp} value={o.bp}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {deviates && (
                  // COPY: confirm met Marlon
                  <span className="text-[color:var(--danger)] text-[10px]">
                    Afwijkend van catalogus (
                    {VAT_OPTIONS.find((o) => o.bp === defaultRate)?.label ??
                      `${(defaultRate ?? 0) / 100}%`}
                    )
                  </span>
                )}
              </div>
              {isDraft && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="text-text-muted text-xs hover:text-[color:var(--danger)] pt-1"
                >
                  Verwijder
                </button>
              )}
            </div>
          );
        })}

        {isDraft && (
          <div className="flex items-center gap-4">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addCatalogueLine(e.target.value);
                e.target.value = "";
              }}
              className="bg-bg border border-[color:var(--ink-500)]/60 text-sm text-text py-1.5 px-2"
            >
              {/* COPY: confirm met Marlon */}
              <option value="">+ Regel uit catalogus…</option>
              {catalogueOptions.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addFreeLine}
              className="text-accent text-sm hover:text-text"
            >
              {/* COPY: confirm met Marlon */}
              + Vrije regel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="ml-auto px-4 py-1.5 border border-accent text-accent text-xs uppercase tracking-[0.16em] hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
            >
              Regels opslaan
            </button>
          </div>
        )}
      </section>

      {/* Totalen */}
      <section className="flex flex-col items-end gap-1 text-sm">
        <span className="text-text-muted">
          Subtotaal excl. BTW: {formatEuro(Math.round(totals.net / 100))}
        </span>
        {Array.from(totals.vatByRate)
          .sort(([a], [b]) => a - b)
          .map(([bp, cents]) => (
            <span key={bp} className="text-text-muted">
              BTW {bp / 100}%: {formatEuro(Math.round(cents / 100))}
            </span>
          ))}
        <span className="text-text text-lg">
          Totaal: {formatEuro(Math.round(totals.gross / 100))}
        </span>
      </section>

      {/* De drie stappen (9.4) + crediteren (9.5) */}
      <section className="flex flex-wrap items-center gap-3 border-t border-[color:var(--ink-500)]/60 pt-6">
        {isDraft && !confirmFinalize && (
          <button
            type="button"
            onClick={() => setConfirmFinalize(true)}
            disabled={isPending || lines.length === 0}
            className="px-4 py-2 bg-accent text-bg text-xs uppercase tracking-[0.16em] disabled:opacity-50"
          >
            {/* COPY: confirm met Marlon */}
            1. Finaliseren…
          </button>
        )}
        {isDraft && confirmFinalize && (
          <div className="flex flex-col gap-2 bg-bg-elevated p-4 border border-accent/40">
            {/* COPY: confirm met Marlon */}
            <p className="text-text text-sm max-w-md">
              Definitief maken voor{" "}
              <strong>{formatEuro(Math.round(totals.gross / 100))}</strong> aan{" "}
              <strong>{invoice.billToName}</strong>? Dit trekt een
              factuurnummer en is onomkeerbaar; herstellen kan daarna alleen
              met een creditnota.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={runFinalize}
                disabled={isPending}
                className="px-4 py-1.5 bg-accent text-bg text-xs uppercase tracking-[0.16em] disabled:opacity-50"
              >
                {/* COPY: confirm met Marlon */}
                Ja, finaliseer
              </button>
              <button
                type="button"
                onClick={() => setConfirmFinalize(false)}
                className="text-text-muted text-xs uppercase tracking-[0.16em]"
              >
                Annuleren
              </button>
            </div>
          </div>
        )}
        {isDraft && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="ml-auto px-4 py-2 border border-[color:var(--danger)]/60 text-[color:var(--danger)] text-xs uppercase tracking-[0.16em] disabled:opacity-50"
          >
            {/* COPY: confirm met Marlon */}
            Concept verwijderen
          </button>
        )}
        {isDraft && confirmDelete && (
          <div className="ml-auto flex items-center gap-3">
            {/* COPY: confirm met Marlon */}
            <span className="text-text-muted text-xs">Zeker weten?</span>
            <button
              type="button"
              onClick={runDelete}
              disabled={isPending}
              className="px-4 py-1.5 border border-[color:var(--danger)] text-[color:var(--danger)] text-xs uppercase tracking-[0.16em] disabled:opacity-50"
            >
              {/* COPY: confirm met Marlon */}
              Ja, verwijder
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-text-muted text-xs uppercase tracking-[0.16em]"
            >
              Annuleren
            </button>
          </div>
        )}
        {!isDraft && !invoice.pdfPath && (
          <button
            type="button"
            onClick={runPdf}
            disabled={isPending}
            className="px-4 py-2 bg-accent text-bg text-xs uppercase tracking-[0.16em] disabled:opacity-50"
          >
            {/* COPY: confirm met Marlon */}
            2. PDF genereren
          </button>
        )}
        {!isDraft && invoice.pdfPath && (
          <>
            <button
              type="button"
              onClick={download}
              disabled={isPending}
              className="px-4 py-2 border border-accent text-accent text-xs uppercase tracking-[0.16em] disabled:opacity-50"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={runSend}
              disabled={isPending}
              className="px-4 py-2 bg-accent text-bg text-xs uppercase tracking-[0.16em] disabled:opacity-50"
            >
              {/* COPY: confirm met Marlon */}
              3. Versturen
            </button>
          </>
        )}
        {!isDraft && !invoice.isCreditNote && (
          <button
            type="button"
            onClick={runCredit}
            disabled={isPending}
            className="ml-auto px-4 py-2 border border-[color:var(--danger)]/60 text-[color:var(--danger)] text-xs uppercase tracking-[0.16em] disabled:opacity-50"
          >
            {/* COPY: confirm met Marlon */}
            Creditnota maken
          </button>
        )}
      </section>

      {message && <p className="text-text-muted text-sm">{message}</p>}
      {!isDraft && (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-xs max-w-prose">
          Stap 2 en 3 zijn opnieuw uit te voeren als ze falen; stap 1 niet.
          De PDF wordt maar één keer gemaakt en verandert daarna nooit meer.
        </p>
      )}
    </div>
  );
}

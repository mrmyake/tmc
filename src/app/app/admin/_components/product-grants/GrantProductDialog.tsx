"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { AdminField, AdminSelect, AdminTextarea } from "@/components/ui/AdminField";
import {
  grantProduct,
  type ProductGrantActionResult,
} from "@/lib/admin/product-grant-actions";
import { grantTermsLabel, type GrantableProduct } from "@/lib/product-grants/core";
import { formatEuroCentsSigned } from "@/lib/format";

/**
 * "Product toekennen" (ledendetail) en "Product klaarzetten" (betaalde
 * factuur): een los product met tegoed zonder order en zonder betaling
 * (spec-facturatie.md 9.8). Credits en geldigheid zijn alleen-lezen en komen
 * uit de catalogus. De reden is verplicht, de factuur optioneel.
 */

export interface GrantInvoiceChoice {
  id: string;
  number: string;
  totalGrossCents: number;
}

interface GrantProductDialogProps {
  open: boolean;
  onClose: () => void;
  profileId: string;
  products: GrantableProduct[];
  /** Ledendetail: de betaalde facturen van dit lid, om er een te kiezen. */
  invoices?: GrantInvoiceChoice[];
  /** Factuurscherm: de factuur staat vast. */
  fixedInvoice?: { id: string; number: string };
  presetSlug?: string;
  /** Factuurscherm met een volle teller: de override direct aanbieden. */
  duplicateExpected?: boolean;
  title: string;
  /** Waarschuwing boven het formulier, bijv. een bestaande kaart van dit type. */
  activeSlugs?: string[];
  /** Het lid heeft een lopend abonnement: waarschuwen, niet blokkeren. */
  hasSubscription?: boolean;
}

export function GrantProductDialog({
  open,
  onClose,
  profileId,
  products,
  invoices = [],
  fixedInvoice,
  presetSlug,
  duplicateExpected = false,
  title,
  activeSlugs = [],
  hasSubscription = false,
}: GrantProductDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ProductGrantActionResult | null>(null);
  const [slug, setSlug] = useState(presetSlug ?? products[0]?.slug ?? "");
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("");
  const [offerOverride, setOfferOverride] = useState(duplicateExpected);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const product = products.find((p) => p.slug === slug) ?? null;
  const effectiveInvoiceId = fixedInvoice?.id ?? (invoiceId || null);
  const needsOverride = offerOverride && effectiveInvoiceId !== null;

  function submit() {
    startTransition(async () => {
      const res = await grantProduct({
        profileId,
        slug,
        reason,
        invoiceId: effectiveInvoiceId,
        allowDuplicate: needsOverride && allowDuplicate,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onClose, 900);
      } else if (res.reason === "already_granted") {
        setOfferOverride(true);
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm mb-5">
        Het lid krijgt het tegoed direct, zonder betaling en zonder mail. Er
        ontstaat geen order en geen omzet: die staat op de factuur.
      </p>

      <AdminField label="Product" className="mb-5">
        <AdminSelect
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setResult(null);
            setOfferOverride(duplicateExpected && e.target.value === presetSlug);
            setAllowDuplicate(false);
          }}
        >
          {products.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.displayName}
            </option>
          ))}
        </AdminSelect>
      </AdminField>

      {product && (
        // COPY: confirm met Marlon
        <p className="text-text text-sm mb-5">
          {grantTermsLabel(product)}. Aantal en geldigheid komen uit de
          catalogus en zijn hier niet aan te passen.
        </p>
      )}

      {product && activeSlugs.includes(product.slug) && (
        // COPY: confirm met Marlon
        <p
          role="note"
          className="text-sm p-4 border border-[color:var(--warning)]/40 text-[color:var(--warning)] mb-5"
        >
          Dit lid heeft al een actief tegoed van dit product. Toekennen maakt
          er een tweede naast.
        </p>
      )}

      {hasSubscription && (
        // COPY: confirm met Marlon
        <p
          role="note"
          data-testid="grant-subscription-warning"
          className="text-sm p-4 border border-[color:var(--warning)]/40 text-[color:var(--warning)] mb-5"
        >
          Dit lid heeft een lopend abonnement. Toekennen kan, maar zolang dit
          tegoed actief is zijn pauzeren, opzeggen en abonnement wisselen op
          het ledendetail tijdelijk niet bereikbaar.
        </p>
      )}

      {fixedInvoice ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-sm mb-5">
          Gekoppeld aan factuur <strong className="text-text">{fixedInvoice.number}</strong>.
        </p>
      ) : (
        <AdminField
          label="Factuur (optioneel)"
          // COPY: confirm met Marlon
          hint="Alleen betaalde facturen van dit lid. Is de factuur nog open, ken dan toe zonder factuur en noem het nummer in de reden."
          className="mb-5"
        >
          <AdminSelect
            value={invoiceId}
            onChange={(e) => {
              setInvoiceId(e.target.value);
              setResult(null);
              setOfferOverride(false);
              setAllowDuplicate(false);
            }}
          >
            <option value="">Geen factuur</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} · {formatEuroCentsSigned(i.totalGrossCents)}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
      )}

      <AdminField label="Reden" className="mb-5">
        <AdminTextarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          // COPY: confirm met Marlon
          placeholder="Bv. betaald per factuur, cadeau van de studio, overstap van een oud systeem"
        />
      </AdminField>

      {needsOverride && (
        <label className="flex items-start gap-3 text-sm text-text mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={allowDuplicate}
            onChange={(e) => setAllowDuplicate(e.target.checked)}
            className="mt-1"
          />
          {/* COPY: confirm met Marlon */}
          <span>
            Dit product is voor deze factuur al toegekend. Ik wil het bewust
            nog een keer toekennen.
          </span>
        </label>
      )}

      <DialogFooter
        result={result}
        onClose={onClose}
        onConfirm={submit}
        // COPY: confirm met Marlon
        confirmLabel={pending ? "Bezig" : "Toekennen"}
        confirmDisabled={
          pending ||
          !product ||
          !reason.trim() ||
          (needsOverride && !allowDuplicate) ||
          result?.ok === true
        }
      />
    </Dialog>
  );
}

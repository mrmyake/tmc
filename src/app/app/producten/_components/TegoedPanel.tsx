import Link from "next/link";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { formatDateLong } from "@/lib/format-date";
import { StatTile } from "@/app/app/_components/StatTile";
import {
  CREDIT_TYPE_LABELS,
  CREDIT_TYPE_ORDER,
  creditType,
  daysUntil,
  isExpiringSoon,
  type CreditMembershipRow,
  type CreditType,
} from "../lib";

export interface ProductHistoryRow {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  status: string;
}

// COPY: confirm met Marlon — kleine lokale statuslabel, zelfde tonen als
// PaymentStatusBadge in /app/facturen (route-lokale duplicatie i.p.v.
// cross-route import, geen wijziging aan /app/facturen zelf).
const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  paid: { label: "Betaald", tone: "text-[color:var(--success)]" },
  pending: { label: "In behandeling", tone: "text-text-muted" },
  open: { label: "In behandeling", tone: "text-text-muted" },
  authorized: { label: "In behandeling", tone: "text-text-muted" },
  failed: { label: "Mislukt", tone: "text-[color:var(--danger)]" },
  expired: { label: "Verlopen", tone: "text-[color:var(--danger)]" },
  canceled: { label: "Geannuleerd", tone: "text-text-muted" },
  refunded: { label: "Teruggestort", tone: "text-text-muted" },
};

function CreditDots({
  remaining,
  total,
}: {
  remaining: number;
  total: number;
}) {
  const used = total - remaining;
  return (
    <div className="flex flex-wrap gap-1.5 mt-4">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={`w-3 h-3 rounded-full ${
            i < used ? "border border-text-muted/30" : "bg-accent"
          }`}
        />
      ))}
    </div>
  );
}

function BalanceCard({
  row,
  type,
}: {
  row: CreditMembershipRow;
  type: CreditType;
}) {
  const label = CREDIT_TYPE_LABELS[type];
  const expiring = row.credits_expires_at
    ? isExpiringSoon(row.credits_expires_at)
    : false;

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-bg-elevated p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-[family-name:var(--font-playfair)] text-lg text-text">
              {label.name}
            </div>
            <div className="text-text-muted text-xs mt-1">{label.sub}</div>
          </div>
          <div className="font-[family-name:var(--font-playfair)] text-3xl text-text whitespace-nowrap">
            {row.credits_remaining}
            <span className="text-text-muted text-lg"> / {row.credits_total}</span>
          </div>
        </div>
        {row.credits_total > 1 && (
          <CreditDots
            remaining={row.credits_remaining}
            total={row.credits_total}
          />
        )}
        {/* COPY: confirm met Marlon */}
        <div className="text-text-muted text-xs mt-4">
          Aangeschaft {formatDateLong(new Date(`${row.start_date}T00:00:00`))}
        </div>
      </div>
      {row.credits_expires_at && (
        <StatTile
          size="md"
          tone={expiring ? "warning" : "default"}
          // COPY: confirm met Marlon
          label="Vervalt op"
          value={formatDateLong(new Date(`${row.credits_expires_at}T00:00:00`))}
          hint={
            expiring
              ? // COPY: confirm met Marlon
                `Nog ${Math.max(0, daysUntil(row.credits_expires_at))} dagen geldig.`
              : undefined
          }
        />
      )}
    </div>
  );
}

function EmptyBalanceCard({ type }: { type: CreditType }) {
  const label = CREDIT_TYPE_LABELS[type];
  return (
    <div className="bg-bg-elevated/40 border border-dashed border-text-muted/25 p-6 flex flex-col justify-center">
      <div className="font-[family-name:var(--font-playfair)] text-lg text-text">
        {label.name}
      </div>
      <p className="text-text-muted text-sm mt-2">{label.emptyText}</p>
      <Link
        href="/app/producten"
        className="text-accent text-sm font-medium mt-3 underline underline-offset-4 w-fit"
      >
        {/* COPY: confirm met Marlon */}
        Bekijk in Kopen
      </Link>
    </div>
  );
}

export function TegoedPanel({
  credits,
  history,
}: {
  credits: CreditMembershipRow[];
  history: ProductHistoryRow[];
}) {
  const grouped = new Map<CreditType, CreditMembershipRow[]>();
  for (const row of credits) {
    const type = creditType(row);
    const list = grouped.get(type) ?? [];
    list.push(row);
    grouped.set(type, list);
  }

  return (
    <div role="tabpanel" aria-label="Mijn tegoed" className="animate-tab-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
        {CREDIT_TYPE_ORDER.flatMap((type) => {
          const rows = grouped.get(type) ?? [];
          if (rows.length === 0) {
            return [<EmptyBalanceCard key={type} type={type} />];
          }
          return rows.map((row) => (
            <BalanceCard key={row.id} row={row} type={type} />
          ));
        })}
      </div>

      <div>
        {/* COPY: confirm met Marlon */}
        <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-5">
          Aankopen
        </h2>
        {history.length === 0 ? (
          // COPY: confirm met Marlon
          <p className="text-text-muted text-sm">
            Je hebt nog geen producten gekocht.
          </p>
        ) : (
          <div className="bg-bg-elevated border border-text-muted/15">
            {history.map((item) => {
              const status = STATUS_LABELS[item.status] ?? {
                label: item.status,
                tone: "text-text-muted",
              };
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[110px_1fr_auto_auto] items-center gap-4 px-5 py-4 border-b border-text-muted/10 last:border-b-0"
                >
                  <span className="text-text-muted text-xs">
                    {formatDateLong(new Date(item.date))}
                  </span>
                  <span className="text-text text-sm">{item.description}</span>
                  <span className="text-text text-sm text-right">
                    {formatEuro(Math.round(item.amountCents / 100))}
                  </span>
                  <span
                    className={`text-[11px] font-medium uppercase tracking-[0.14em] text-right ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

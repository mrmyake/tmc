"use client";

import Link from "next/link";
import { useState } from "react";
import type { MemberRow, MemberSort } from "@/lib/admin/members-query";
import { AvatarBubble } from "@/app/app/_shared/attendance/AvatarBubble";
import { PlanBadge } from "@/app/app/_shared/attendance/PlanBadge";
import { MembershipStatusBadge } from "./MembershipStatusBadge";
import { SortableHeader } from "./SortableHeader";
import { BulkActions } from "./BulkActions";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { amsterdamParts, DAY_SHORT_NL, MONTH_SHORT_NL } from "@/lib/format-date";

interface MembersTableProps {
  rows: MemberRow[];
  sort: MemberSort;
  activeFilters: {
    q: string;
    status: string;
    plan: string;
    inactive: boolean;
    page: number;
  };
}

function formatLastSession(iso: string | null): string {
  if (!iso) return "Nooit";
  const d = new Date(`${iso}T00:00:00Z`);
  const p = amsterdamParts(d);
  return `${DAY_SHORT_NL[p.weekday]} ${p.day} ${MONTH_SHORT_NL[p.month - 1]}`;
}

function isStale(iso: string | null): boolean {
  if (!iso) return true;
  const asDate = new Date(`${iso}T00:00:00Z`);
  return Date.now() - asDate.getTime() > 30 * 86_400_000;
}

export function MembersTable({ rows, sort }: MembersTableProps) {
  const [selection, setSelection] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  }

  function toggleAll() {
    if (selection.size === rows.length && rows.length > 0) {
      setSelection(new Set());
    } else {
      setSelection(new Set(rows.map((r) => r.profileId)));
    }
  }

  if (rows.length === 0) {
    return (
      <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          Geen leden
        </span>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          Geen leden gevonden bij deze filters. Probeer een andere status of
          wis je zoekopdracht.
        </p>
      </div>
    );
  }

  const allChecked = selection.size === rows.length && rows.length > 0;
  const someChecked = selection.size > 0 && !allChecked;

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              <th scope="col" className="py-3 pl-3 pr-2 w-10 text-left">
                <input
                  type="checkbox"
                  aria-label="Selecteer alle zichtbare rijen"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={toggleAll}
                  className="cursor-pointer"
                />
              </th>
              <th scope="col" className="py-3 pr-4 text-left">
                <SortableHeader label="Naam" column="name" sort={sort} />
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Abonnement</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Status</span>
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                <SortableHeader
                  label="Credits"
                  column="credits"
                  sort={sort}
                />
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <SortableHeader
                  label="Laatste sessie"
                  column="last_session"
                  sort={sort}
                />
              </th>
              <th scope="col" className="py-3 pl-4 pr-3 text-right">
                <SortableHeader label="MRR" column="mrr" sort={sort} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const stale = isStale(r.lastSessionDate);
              const isActiveMember = r.membershipStatus === "active";
              return (
                <tr
                  key={r.profileId}
                  className="group border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 hover:bg-bg-elevated/60"
                >
                  <td className="py-4 pl-3 pr-2 align-middle">
                    <input
                      type="checkbox"
                      aria-label={`Selecteer ${r.firstName} ${r.lastName}`}
                      checked={selection.has(r.profileId)}
                      onChange={() => toggle(r.profileId)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <Link
                      href={`/app/admin/leden/${r.profileId}`}
                      className="flex items-center gap-3 group/name"
                    >
                      <AvatarBubble
                        firstName={r.firstName}
                        lastName={r.lastName}
                        avatarUrl={null}
                        size={32}
                      />
                      <span className="flex flex-col min-w-0">
                        <span className="text-text text-sm font-medium truncate transition-colors duration-300 group-hover/name:text-accent">
                          {r.firstName} {r.lastName}
                        </span>
                        <span className="text-text-muted text-xs truncate">
                          {r.email}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-4 px-4 align-middle">
                    <PlanBadge
                      planType={r.planType}
                      planVariant={r.planVariant}
                    />
                  </td>
                  <td className="py-4 px-4 align-middle">
                    <MembershipStatusBadge status={r.membershipStatus} />
                  </td>
                  <td className="py-4 px-4 align-middle text-right text-sm text-text tabular-nums">
                    {r.creditsRemaining == null ? "—" : r.creditsRemaining}
                  </td>
                  <td className="py-4 px-4 align-middle text-sm">
                    <span
                      className={stale ? "text-text-muted" : "text-text"}
                    >
                      {formatLastSession(r.lastSessionDate)}
                    </span>
                  </td>
                  <td className="py-4 pl-4 pr-3 align-middle text-right text-sm tabular-nums">
                    <span
                      className={
                        isActiveMember ? "text-text" : "text-text-muted"
                      }
                    >
                      {r.mrrCents > 0
                        ? formatEuro(Math.round(r.mrrCents / 100))
                        : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="md:hidden flex flex-col border-t border-[color:var(--ink-500)]/60">
        {rows.map((r) => (
          <li
            key={r.profileId}
            className="flex items-start gap-3 py-4 border-b border-[color:var(--ink-500)]/40"
          >
            <input
              type="checkbox"
              aria-label={`Selecteer ${r.firstName} ${r.lastName}`}
              checked={selection.has(r.profileId)}
              onChange={() => toggle(r.profileId)}
              className="mt-1.5 cursor-pointer"
            />
            <Link
              href={`/app/admin/leden/${r.profileId}`}
              className="flex-1 min-w-0 flex gap-3"
            >
              <AvatarBubble
                firstName={r.firstName}
                lastName={r.lastName}
                avatarUrl={null}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <p className="text-text text-sm font-medium truncate">
                  {r.firstName} {r.lastName}
                </p>
                <p className="text-text-muted text-xs truncate mb-2">
                  {r.email}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <PlanBadge
                    planType={r.planType}
                    planVariant={r.planVariant}
                  />
                  <MembershipStatusBadge status={r.membershipStatus} />
                </div>
                <p className="text-text-muted text-xs mt-2">
                  {formatLastSession(r.lastSessionDate)} ·{" "}
                  {r.creditsRemaining == null
                    ? "—"
                    : `${r.creditsRemaining} credits`}{" "}
                  ·{" "}
                  {r.mrrCents > 0
                    ? formatEuro(Math.round(r.mrrCents / 100))
                    : "—"}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <BulkActions
        rows={rows}
        selection={selection}
        onClear={() => setSelection(new Set())}
      />
    </>
  );
}

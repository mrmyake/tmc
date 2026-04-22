"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { MemberSort } from "@/lib/admin/members-query";

const SORT_STORAGE_KEY = "tmc-admin-leden-sort";

interface SortableHeaderProps {
  label: string;
  column: "name" | "last_session" | "mrr" | "credits";
  sort: MemberSort;
}

function parse(
  sort: MemberSort,
): { column: string; direction: "asc" | "desc" } {
  const [col, dir] = sort.split("_").reduce<string[]>((acc, part) => {
    if (part === "asc" || part === "desc") {
      acc[1] = part;
    } else {
      acc[0] = acc[0] ? `${acc[0]}_${part}` : part;
    }
    return acc;
  }, []);
  return { column: col, direction: dir as "asc" | "desc" };
}

export function SortableHeader({ label, column, sort }: SortableHeaderProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const parsed = parse(sort);
  const active = parsed.column === column;

  // Persist sort per-session so the default survives navigation back+forth.
  useEffect(() => {
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, sort);
    } catch {
      // sessionStorage may be disabled; ignore.
    }
  }, [sort]);

  function nextSort(): MemberSort {
    if (!active) {
      return `${column}_${column === "name" ? "asc" : "desc"}` as MemberSort;
    }
    const nextDir = parsed.direction === "asc" ? "desc" : "asc";
    return `${column}_${nextDir}` as MemberSort;
  }

  function toggle() {
    const next = new URLSearchParams(sp.toString());
    next.set("sort", nextSort());
    next.delete("page");
    router.push(`/app/admin/leden?${next.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors cursor-pointer ${
        active ? "text-accent" : "text-text-muted hover:text-text"
      }`}
    >
      {label}
      {active &&
        (parsed.direction === "asc" ? (
          <ArrowUp size={11} strokeWidth={1.8} aria-hidden />
        ) : (
          <ArrowDown size={11} strokeWidth={1.8} aria-hidden />
        ))}
    </button>
  );
}

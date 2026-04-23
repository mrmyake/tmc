"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "@/components/ui/AdminField";
import {
  saveAnnouncement,
  type AnnouncementActionResult,
} from "@/lib/admin/announcements-actions";
import type {
  AnnouncementAudience,
  AnnouncementRow,
} from "@/lib/announcements-query";

interface Props {
  existing: AnnouncementRow | null;
  onDone: () => void;
}

function isoForInput(iso: string | null): string {
  if (!iso) return "";
  // <input type="datetime-local"> expects yyyy-mm-ddThh:mm in local time,
  // not a timezone offset. Strip seconds + Z.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function AnnouncementForm({ existing, onDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AnnouncementActionResult | null>(null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [audience, setAudience] = useState<AnnouncementAudience>(
    existing?.audience ?? "trainers",
  );
  const [publishMode, setPublishMode] = useState<
    "now" | "schedule" | "draft"
  >(existing?.publishedAt ? "schedule" : "now");
  const [publishAt, setPublishAt] = useState(isoForInput(existing?.publishedAt ?? null));
  const [expiresAt, setExpiresAt] = useState(
    isoForInput(existing?.expiresAt ?? null),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveAnnouncement({
        id: existing?.id,
        title,
        body,
        audience,
        publishNow: publishMode === "now",
        publishedAt: publishMode === "schedule" ? inputToIso(publishAt) : null,
        expiresAt: inputToIso(expiresAt),
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onDone, 600);
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="bg-bg-elevated p-6 md:p-8 border border-[color:var(--ink-500)] flex flex-col gap-6"
    >
      <header className="flex items-center justify-between">
        <span className="tmc-eyebrow tmc-eyebrow--accent">
          {existing ? "Bewerken" : "Nieuwe aankondiging"}
        </span>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          Sluit
        </button>
      </header>

      <AdminField label="Titel">
        <AdminInput
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
        />
      </AdminField>

      <AdminField label="Body">
        <AdminTextarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={4000}
        />
        <span className="text-xs text-text-muted tabular-nums self-end">
          {body.length} / 4000
        </span>
      </AdminField>

      <AdminField label="Doelgroep">
        <AdminSelect
          value={audience}
          onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
        >
          <option value="trainers">Alleen trainers</option>
          <option value="members">Alleen leden</option>
          <option value="all">Iedereen</option>
        </AdminSelect>
      </AdminField>

      <fieldset className="flex flex-col gap-3">
        <legend className="tmc-eyebrow mb-1">Publicatie</legend>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name="publishMode"
            checked={publishMode === "now"}
            onChange={() => setPublishMode("now")}
          />
          <span className="text-sm text-text">Direct publiceren</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name="publishMode"
            checked={publishMode === "schedule"}
            onChange={() => setPublishMode("schedule")}
          />
          <span className="text-sm text-text">Inplannen op</span>
          <AdminInput
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            disabled={publishMode !== "schedule"}
            className="px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name="publishMode"
            checked={publishMode === "draft"}
            onChange={() => setPublishMode("draft")}
          />
          <span className="text-sm text-text">Bewaar als concept</span>
        </label>
      </fieldset>

      <AdminField label="Verloopt op (optioneel)">
        <AdminInput
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="px-3 py-2"
        />
      </AdminField>

      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`text-sm p-4 border ${
            result.ok
              ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
              : "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
          }`}
        >
          {result.message}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {pending ? "Bezig" : existing ? "Opslaan" : "Plaats"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
        >
          Annuleren
        </button>
      </div>
    </form>
  );
}

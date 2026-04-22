"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNote } from "@/lib/admin/member-actions";
import { formatDateLong } from "@/lib/format-date";
import type {
  MemberAuditRow,
  MemberDetail,
} from "@/lib/admin/member-detail-query";

const AUDIT_LABELS: Record<string, string> = {
  pause_granted: "Pauze toegekend",
  credits_adjusted: "Credits aangepast",
  attendance_override: "Aanwezigheid overschreven",
  credit_refund: "Credit teruggezet",
  mailerlite_push: "MailerLite push",
  member_deleted: "Lid verwijderd",
};

function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

function auditDetailLine(row: MemberAuditRow): string | null {
  const d = row.details ?? {};
  const parts: string[] = [];
  if (typeof d.reason === "string" && d.reason) parts.push(d.reason);
  if (typeof d.delta === "number") parts.push(`Δ ${d.delta}`);
  if (typeof d.previous_balance === "number" && typeof d.new_balance === "number") {
    parts.push(`${d.previous_balance} → ${d.new_balance}`);
  }
  if (typeof d.from === "string" && typeof d.to === "string") {
    parts.push(`${d.from} → ${d.to}`);
  }
  if (typeof d.start_date === "string" && typeof d.end_date === "string") {
    parts.push(`${d.start_date} → ${d.end_date}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function NotesTab({ detail }: { detail: MemberDetail }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await createNote({
        profileId: detail.profile.id,
        body,
      });
      if (res.ok) {
        setBody("");
        setMessage({ tone: "success", text: res.message });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: res.message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-12">
      <section>
        <header className="mb-4">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
            Notitie toevoegen
          </span>
          <p className="text-text-muted text-sm">
            Alleen zichtbaar voor admin. Het lid ziet deze notities niet.
          </p>
        </header>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Bv. telefoongesprek, observatie tijdens les, afspraak over factuur…"
          className="w-full bg-bg-elevated border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-text-muted tabular-nums">
            {body.length} / 2000
          </span>
          <div className="flex items-center gap-3">
            {message && (
              <span
                role={message.tone === "success" ? "status" : "alert"}
                className={`text-xs ${
                  message.tone === "success"
                    ? "text-[color:var(--success)]"
                    : "text-[color:var(--danger)]"
                }`}
              >
                {message.text}
              </span>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={pending || !body.trim()}
              className="inline-flex items-center justify-center px-6 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {pending ? "Bezig" : "Opslaan"}
            </button>
          </div>
        </div>
      </section>

      <section>
        <header className="mb-6">
          <span className="tmc-eyebrow block mb-2">Geschiedenis</span>
          <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
            {detail.notes.length === 0
              ? "Nog geen notities"
              : `${detail.notes.length} notitie${detail.notes.length === 1 ? "" : "s"}`}
          </h2>
        </header>
        {detail.notes.length === 0 ? (
          <p className="text-text-muted text-sm">
            Voeg een eerste notitie toe. Notities zijn append-only en
            zichtbaar voor alle admins.
          </p>
        ) : (
          <ol className="relative flex flex-col gap-6 pl-6 border-l border-[color:var(--ink-500)]/60">
            {detail.notes.map((n) => (
              <li key={n.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[29px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent"
                />
                <p className="tmc-eyebrow mb-2">
                  {formatDateLong(new Date(n.createdAt))} · {n.authorName}
                </p>
                <p className="text-text text-sm leading-relaxed whitespace-pre-wrap">
                  {n.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {detail.audit.length > 0 && (
        <section>
          <header className="mb-6">
            <span className="tmc-eyebrow block mb-2">Audit</span>
            <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
              Admin-acties
            </h2>
          </header>
          <ol className="relative flex flex-col gap-5 pl-6 border-l border-[color:var(--ink-500)]/60">
            {detail.audit.map((a) => {
              const line = auditDetailLine(a);
              return (
                <li key={a.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[27px] top-2 w-1.5 h-1.5 rounded-full bg-text-muted"
                  />
                  <p className="tmc-eyebrow mb-1.5">
                    {formatDateLong(new Date(a.createdAt))} · {a.adminName}
                  </p>
                  <p className="text-text text-sm">
                    {auditLabel(a.action)}
                    {line && (
                      <span className="text-text-muted"> · {line}</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

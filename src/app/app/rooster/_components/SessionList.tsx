"use client";

import { useMemo, useState } from "react";
import { BookingSheet } from "./BookingSheet";
import { SessionRow, type SessionRowData } from "./SessionRow";

interface SerializedSession {
  id: string;
  startAt: string;
  endAt: string;
  className: string;
  trainerName: string;
  trainerBio: string | null;
  pillar: string;
  capacity: number;
  bookedCount: number;
  status: SessionRowData["status"];
  bookingId: string | null;
}

interface SessionListProps {
  dayGroups: Array<{
    isoDate: string;
    label: string;
    sessions: SerializedSession[];
  }>;
  cancellationWindowHours: number;
}

export function SessionList({
  dayGroups,
  cancellationWindowHours,
}: SessionListProps) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const rowsById = useMemo(() => {
    const map = new Map<string, SerializedSession>();
    for (const day of dayGroups) {
      for (const s of day.sessions) map.set(s.id, s);
    }
    return map;
  }, [dayGroups]);

  const openSerialized = openSessionId ? rowsById.get(openSessionId) : null;
  const openRow: SessionRowData | null = openSerialized
    ? {
        id: openSerialized.id,
        startAt: new Date(openSerialized.startAt),
        endAt: new Date(openSerialized.endAt),
        className: openSerialized.className,
        trainerName: openSerialized.trainerName,
        pillar: openSerialized.pillar,
        capacity: openSerialized.capacity,
        bookedCount: openSerialized.bookedCount,
        status: openSerialized.status,
        bookingId: openSerialized.bookingId,
      }
    : null;

  if (dayGroups.length === 0) {
    return (
      <div className="py-20 text-center">
        <span className="tmc-eyebrow block mb-3">Geen sessies</span>
        <p className="text-text-muted text-base max-w-md mx-auto">
          Geen sessies gevonden voor dit filter of deze week. Probeer een
          andere week of kies een andere discipline.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-14">
        {dayGroups.map((day) => (
          <section key={day.isoDate}>
            <div className="flex items-baseline gap-4 mb-1">
              <span className="tmc-eyebrow">{day.label}</span>
              <span
                aria-hidden
                className="flex-1 h-px bg-[color:var(--ink-500)]/50"
              />
            </div>
            {day.sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={{
                  id: s.id,
                  startAt: new Date(s.startAt),
                  endAt: new Date(s.endAt),
                  className: s.className,
                  trainerName: s.trainerName,
                  pillar: s.pillar,
                  capacity: s.capacity,
                  bookedCount: s.bookedCount,
                  status: s.status,
                  bookingId: s.bookingId,
                }}
                onOpen={(session) => setOpenSessionId(session.id)}
              />
            ))}
          </section>
        ))}
      </div>

      <BookingSheet
        session={openRow}
        trainerBio={openSerialized?.trainerBio ?? null}
        cancellationWindowHours={cancellationWindowHours}
        onClose={() => setOpenSessionId(null)}
      />
    </>
  );
}

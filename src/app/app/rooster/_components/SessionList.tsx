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
  /**
   * Lessen voor de geselecteerde dag. Pagina stuurt enkel één dag door,
   * niet meer een dayGroups-array. De flat-lijst houdt de DOM licht.
   */
  sessions: SerializedSession[];
  cancellationWindowHours: number;
}

export function SessionList({
  sessions,
  cancellationWindowHours,
}: SessionListProps) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const rowsById = useMemo(() => {
    const map = new Map<string, SerializedSession>();
    for (const s of sessions) map.set(s.id, s);
    return map;
  }, [sessions]);

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

  if (sessions.length === 0) {
    return (
      <div className="py-16 text-center">
        <span className="tmc-eyebrow block mb-3">Geen lessen</span>
        <p className="text-text-muted text-base max-w-md mx-auto">
          Geen lessen gepubliceerd voor deze dag. Probeer een andere dag of
          kies een andere discipline.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col">
        {sessions.map((s) => (
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

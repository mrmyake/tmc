/**
 * Wachtlijst: pure helpers voor de ledenapp en de cron
 * (spec-community-growth.md, sectie Wachtlijst). De regels zelf leven in de
 * database (tmc.join_waitlist, tmc.leave_waitlist,
 * tmc.promote_waitlist_entries, tmc.my_waitlist_entries); hier staat alleen
 * de vertaling naar weergave.
 */

import type { SessionStatus } from "@/components/ui/StatusBadge";

/** Een rij uit tmc.my_waitlist_entries(). */
export interface MyWaitlistEntry {
  entry_id: string;
  session_id: string;
  position: number;
  /** Plek onder de wachtenden (open, nog niet gepromoveerd), 1 = eerste. */
  rank: number;
  state: "waiting" | "promoted";
  promoted_at: string | null;
  confirmation_deadline: string | null;
  created_at: string;
}

/**
 * Voorrang van de eigen status op een les: boeking gaat voor een open
 * promotie, die gaat voor een wachtlijstplek. Zonder een van de drie
 * beslist canBook() (rooster) of blijft de les weg (boekingen).
 */
export function memberSessionStatus(args: {
  hasBooking: boolean;
  waitlist: Pick<MyWaitlistEntry, "state"> | null | undefined;
}): Extract<SessionStatus, "booked" | "promoted" | "waitlisted"> | null {
  if (args.hasBooking) return "booked";
  if (args.waitlist?.state === "promoted") return "promoted";
  if (args.waitlist?.state === "waiting") return "waitlisted";
  return null;
}

const amsterdamClock = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const amsterdamDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * "voor 18:25" in Amsterdamse tijd, of "voor morgen 07:30" als de deadline
 * op een andere Amsterdamse kalenderdag valt dan `now` (rustvenster
 * 22:00-07:00: de deadline is dan de eerstvolgende 07:30). Wordt gebruikt
 * in mail, push en de app, zodat overal dezelfde tekst staat.
 */
export function confirmDeadlineLabel(deadline: Date, now: Date = new Date()): string {
  const time = amsterdamClock.format(deadline);
  const sameDay = amsterdamDate.format(deadline) === amsterdamDate.format(now);
  // COPY: confirm met Marlon
  return sameDay ? `voor ${time}` : `voor morgen ${time}`;
}

export type AgendaViewMode = "day" | "week" | "month";

export type AgendaSessionKind = "bookable" | "intake" | "block";
export type AgendaSessionStatus = "scheduled" | "cancelled" | "completed";
export type AgendaBookingStatus =
  | "pending"
  | "booked"
  | "cancelled"
  | "attended"
  | "no_show";

export interface AgendaBookingInfo {
  id: string;
  status: AgendaBookingStatus;
  profileId: string;
  firstName: string;
  lastName: string;
  introduceeName: string | null;
  /**
   * Of er bij het boeken een credit is gedebiteerd. Bepaalt of de
   * annuleer-stap een restitutie-keuze toont (PT-agenda PR J).
   */
  usedCredit: boolean;
}

export interface AgendaProspectInfo {
  name: string;
  email: string;
  phone: string | null;
}

export interface AgendaProgramInfo {
  type: "studio" | "online";
  totalSessions: number;
}

export interface AgendaSessionData {
  id: string;
  trainerId: string;
  kind: AgendaSessionKind;
  format: "one_on_one" | "duo" | "small_group_4" | null;
  mode: "studio" | "online" | null;
  status: AgendaSessionStatus;
  startAt: string;
  endAt: string;
  durationMin: number;
  booking: AgendaBookingInfo | null;
  prospect: AgendaProspectInfo | null;
  program: AgendaProgramInfo | null;
}

/**
 * Een sessie plus alle geometrie die de grid nodig heeft: het pixel-
 * gepositioneerde kernblok (start/duur), de omkleedtijd-buffer uit
 * get_pt_busy (alleen bookable/intake hebben die), en de laan-toewijzing
 * voor bewust naast-elkaar getoonde dubbelboekingen (zie
 * lib/overlap-layout.ts).
 */
export interface AgendaSessionBlockData extends AgendaSessionData {
  startOffsetMin: number;
  startLabel: string;
  /** Buffer vóór de kern, in minuten (0 voor block-sessies). */
  bufferBeforeMin: number;
  /** Buffer ná de kern, in minuten (0 voor block-sessies). */
  bufferAfterMin: number;
  lane: number;
  laneCount: number;
  overlapping: boolean;
}

export interface AgendaDay {
  isoDate: string;
  weekdayShort: string;
  dayNumber: number;
  monthShort: string;
  isToday: boolean;
  isCurrentMonth: boolean;
  sessions: AgendaSessionBlockData[];
}

export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 22;
export const GRID_HEIGHT_PX = (GRID_END_HOUR - GRID_START_HOUR) * 60;

export interface TrainerOption {
  id: string;
  displayName: string;
  slug: string;
}

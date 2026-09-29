export interface AdminSessionBlockData {
  id: string;
  classTypeId: string;
  className: string;
  trainerId: string;
  trainerName: string;
  pillar: string;
  ageCategory: string;
  /** NULL betekent onbeperkt (alleen kettlebell). */
  capacity: number | null;
  /** Leden-boekingen (status 'booked'); voor deelnemerslijst en annuleer-copy. */
  bookedCount: number;
  /** Totale bezetting uit de view: leden + proeflessen + gasten. */
  takenCount: number;
  /** Proeflessen (pending/paid/attended), voor de capaciteitswaarschuwing. */
  trialCount: number;
  /** Gasten (booked/attended), voor de capaciteitswaarschuwing. */
  guestCount: number;
  startAt: string;
  endAt: string;
  status: "scheduled" | "cancelled" | "completed";
  notes: string | null;
  blocksFreeTraining: boolean;
  /** Onderdeel van een herhalende serie (schedule_templates.id), of null voor een ad-hoc sessie. */
  templateId: string | null;
  /** Open wachtlijstplekken, voor het annuleer-bevestigscherm. */
  waitlistCount: number;
  /** Reden bij een geannuleerde sessie. */
  cancellationReason: string | null;
  /** Oude starttijd ("18:00") als de les eenmalig verschoven is (spec-session-overrides.md). */
  rescheduledFromLabel: string | null;
  /** Trainer eenmalig vervangen voor deze les. */
  trainerReplaced: boolean;
  /** Les is begonnen of voorbij: eenmalige wijzigingen kunnen niet meer. */
  hasStarted: boolean;
  // Pre-computed Amsterdam-local offsets so the client doesn't need to do
  // timezone math. startOffsetMin is minutes after GRID_START_HOUR (06:00 AMS);
  // durationMin is session length.
  startOffsetMin: number;
  durationMin: number;
  startLabel: string; // "06:30"
}

export interface AdminTrainerOption {
  id: string;
  displayName: string;
  isActive: boolean;
  /** trainers.pillar_specialties, voor de waarschuwing bij vervangen. */
  pillarSpecialties: string[];
}

export interface AdminClassTypeOption {
  id: string;
  name: string;
  pillar: string;
  ageCategory: string;
  defaultCapacity: number | null;
  defaultDurationMinutes: number;
}

export interface AdminScheduleTemplateOption {
  id: string;
  classTypeId: string;
  className: string;
  pillar: string;
  trainerId: string;
  trainerName: string;
  /** 0-6, 0 = zondag (JS getDay-conventie). */
  dayOfWeek: number;
  startTime: string; // "HH:mm"
  durationMinutes: number;
  /** NULL betekent onbeperkt (alleen kettlebell). */
  capacity: number | null;
  blocksFreeTraining: boolean;
  validFrom: string; // ISO date
  validUntil: string | null;
}

export interface AdminDay {
  isoDate: string;
  weekdayShort: string;
  dayNumber: number;
  monthShort: string;
  isToday: boolean;
  sessions: AdminSessionBlockData[];
  /** Er is op deze dag minstens een geplande les die nog moet beginnen. */
  hasCancellableSessions: boolean;
}

export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 22;
export const GRID_HEIGHT_PX = (GRID_END_HOUR - GRID_START_HOUR) * 60;

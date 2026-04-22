export interface AdminSessionBlockData {
  id: string;
  classTypeId: string;
  className: string;
  trainerId: string;
  trainerName: string;
  pillar: string;
  ageCategory: string;
  capacity: number;
  bookedCount: number;
  startAt: string;
  endAt: string;
  status: "scheduled" | "cancelled" | "completed";
  notes: string | null;
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
}

export interface AdminClassTypeOption {
  id: string;
  name: string;
  pillar: string;
  ageCategory: string;
  defaultCapacity: number;
  defaultDurationMinutes: number;
}

export interface AdminDay {
  isoDate: string;
  weekdayShort: string;
  dayNumber: number;
  monthShort: string;
  isToday: boolean;
  sessions: AdminSessionBlockData[];
}

export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 22;
export const GRID_HEIGHT_PX = (GRID_END_HOUR - GRID_START_HOUR) * 60;

export interface Feature {
  id: number;
  it: string;
  en: string;
}

export interface Occupation {
  inizio: string;
  fine: string;
  category?: string;
  course?: string;
  raw?: string;
  name?: string;
  code?: number | string;
  section?: string;
  professors?: string[];
}

export interface Classroom {
  id: number;
  name: string;
  /** Null when the directory doesn't know it. */
  floor?: number | null;
  features?: Feature[];
  idfoto?: number | null;
  seats?: number;
  accessible_seats?: number;
  workstations?: number;
  /** Null when no source had the schedule that day: unknown, never free. */
  occupancy?: Occupation[] | null;
}

export interface BuildingHours {
  mon_fri: [string, string] | null;
  sat: [string, string] | null;
  sun: [string, string] | null;
}

export interface Building<Room extends Classroom = Classroom> {
  id?: string | number | null;
  name: string;
  altName?: string;
  lat?: number;
  long?: number;
  address?: string;
  hours?: BuildingHours;
  classrooms: Room[];
}

export interface Campus<Room extends Classroom = Classroom> {
  id: string;
  name: string;
  slug?: string;
  city?: string;
  group?: string;
  lat?: number;
  long?: number;
  buildings: Building<Room>[];
}

export interface OccupancyDay {
  date: string;
  generated_at: string;
  campuses: Campus<Classroom & { occupancy: Occupation[] | null }>[];
}

export interface HolidayPeriod {
  /** Inclusive ISO dates, "YYYY-MM-DD". */
  start: string;
  end: string;
}

export interface OpeningHours {
  buildings: Record<string, BuildingHours>;
  campus_defaults: Record<string, BuildingHours>;
  default_hours: BuildingHours;
  holiday_periods?: HolidayPeriod[];
}

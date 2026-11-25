import type { Hazard, HazardSeverityLevel } from './types';

export interface DayOption {
  /** YYYY-MM-DD in Asia/Manila timezone. */
  dateKey: string;
  /** 0 = today (live), 1..N = previous days. */
  offset: number;
  isLive: boolean;
  label: string; // "Nov 22 (Live)" / "Nov 21"
  shortDate: string; // "Nov 21"
  count: number;
  peakSeverity: HazardSeverityLevel | null;
}

export const HISTORY_TAB_DAYS = 6;

export function manilaDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatShortManilaDate(dateKey: string): string {
  const parsed = new Date(`${dateKey}T12:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
  });
}

export function formatEventDateRange(startDate: string, endDate: string): string {
  const startLabel = formatShortManilaDate(startDate);
  const year = startDate.slice(0, 4);
  if (startDate === endDate) return `${startLabel}, ${year}`;
  const endLabel = formatShortManilaDate(endDate);
  return `${startLabel} – ${endLabel}, ${endDate.slice(0, 4)}`;
}

export function buildRecentManilaDates(
  daysCount = HISTORY_TAB_DAYS + 1,
  now: Date = new Date(),
): string[] {
  const todayKey = manilaDateKey(now);
  const baseMs = Date.parse(`${todayKey}T12:00:00+08:00`);
  const keys: string[] = [];
  for (let offset = 0; offset < daysCount; offset += 1) {
    keys.push(manilaDateKey(new Date(baseMs - offset * 86_400_000)));
  }
  return keys;
}

/** Kept for compatibility with pure helper callers. */
export function hazardsForDay(hazards: Hazard[], day: DayOption): Hazard[] {
  if (day.isLive) return hazards.filter((h) => h.status === 'active');
  const startMs = Date.parse(`${day.dateKey}T00:00:00+08:00`);
  const endMs = Date.parse(`${day.dateKey}T23:59:59.999+08:00`);
  return hazards
    .filter((h) => {
      const reported = Date.parse(h.reportedAt);
      const resolved = h.resolvedAt ? Date.parse(h.resolvedAt) : Infinity;
      return reported <= endMs && resolved >= startMs;
    })
    .sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt));
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

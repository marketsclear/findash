/** Calendar helpers. All days are UTC calendar dates formatted YYYY-MM-DD. */
export type Day = string;

export const DAY_MS = 86_400_000;

export function dayFromMs(ms: number): Day {
  return new Date(Math.floor(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

export function dayToMs(day: Day): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function addDays(day: Day, n: number): Day {
  return dayFromMs(dayToMs(day) + n * DAY_MS);
}

export function addYears(day: Day, n: number): Day {
  const d = new Date(dayToMs(day));
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

export function todayUtc(): Day {
  return dayFromMs(Date.now());
}

export function eachDay(start: Day, end: Day): Day[] {
  const out: Day[] = [];
  for (let ms = dayToMs(start); ms <= dayToMs(end); ms += DAY_MS) out.push(dayFromMs(ms));
  return out;
}

export function minDay(a: Day, b: Day): Day {
  return a < b ? a : b;
}

export function maxDay(a: Day, b: Day): Day {
  return a > b ? a : b;
}

/** NYSE full-day closures, 2025-2027 (incl. the 9 Jan 2025 national day of mourning). */
const NYSE_HOLIDAYS = new Set([
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

export function isTradingDay(day: Day): boolean {
  const wd = new Date(dayToMs(day)).getUTCDay();
  return wd !== 0 && wd !== 6 && !NYSE_HOLIDAYS.has(day);
}

/** The first NYSE trading day strictly after `day`. */
export function nextTradingDay(day: Day): Day {
  let d = addDays(day, 1);
  while (!isTradingDay(d)) d = addDays(d, 1);
  return d;
}

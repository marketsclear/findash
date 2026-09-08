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

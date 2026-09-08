import { addDays, addYears, Day, eachDay, maxDay, minDay } from "./days";

export type WindowKey = "daily" | "weekly" | "monthly" | "ytd" | "yearly";

export interface Window {
  key: WindowKey;
  label: string;
  start: Day;
  end: Day;
  prevStart: Day;
  prevEnd: Day;
  prevLabel: string;
}

/** The five reporting windows, all ending on `end` (the last complete UTC day). */
export function windowsEnding(end: Day): Window[] {
  const year = end.slice(0, 4);
  return [
    { key: "daily", label: "Daily", start: end, end, prevStart: addDays(end, -1), prevEnd: addDays(end, -1), prevLabel: "vs previous day" },
    { key: "weekly", label: "Weekly", start: addDays(end, -6), end, prevStart: addDays(end, -13), prevEnd: addDays(end, -7), prevLabel: "vs previous 7 days" },
    { key: "monthly", label: "Monthly", start: addDays(end, -29), end, prevStart: addDays(end, -59), prevEnd: addDays(end, -30), prevLabel: "vs previous 30 days" },
    { key: "ytd", label: "Year to date", start: `${year}-01-01`, end, prevStart: `${Number(year) - 1}-01-01`, prevEnd: addYears(end, -1), prevLabel: "vs same period last year" },
    { key: "yearly", label: "Yearly", start: addDays(end, -364), end, prevStart: addDays(end, -729), prevEnd: addDays(end, -365), prevLabel: "vs previous 365 days" },
  ];
}

export interface DailySeries {
  days: Record<Day, number>;
  firstDay: Day | null;
  lastDay: Day | null;
}

export function makeSeries(days: Record<Day, number>): DailySeries {
  const keys = Object.keys(days).sort();
  return { days, firstDay: keys[0] ?? null, lastDay: keys[keys.length - 1] ?? null };
}

export function sumSeries(a: Record<Day, number>, ...rest: Record<Day, number>[]): Record<Day, number> {
  const out: Record<Day, number> = { ...a };
  for (const r of rest) for (const [day, v] of Object.entries(r)) out[day] = (out[day] ?? 0) + v;
  return out;
}

export function sumRange(days: Record<Day, number>, start: Day, end: Day): number {
  let s = 0;
  for (const d of eachDay(start, end)) s += days[d] ?? 0;
  return s;
}

export interface WindowStat {
  key: WindowKey;
  value: number | null;
  /** Actual range summed, after clipping to the data available. */
  from: Day | null;
  through: Day | null;
  /** True when the data does not cover the whole requested window. */
  partial: boolean;
  prev: number | null;
  deltaPct: number | null;
}

/** Sum a series over a window, clipping to available data and computing the period-over-period delta. */
export function windowStat(series: DailySeries, w: Window): WindowStat {
  const empty: WindowStat = { key: w.key, value: null, from: null, through: null, partial: true, prev: null, deltaPct: null };
  if (!series.firstDay || !series.lastDay) return empty;
  const from = maxDay(series.firstDay, w.start);
  const through = minDay(series.lastDay, w.end);
  if (through < from) return empty;
  const partial = from !== w.start || through !== w.end;
  const value = sumRange(series.days, from, through);
  const prevCovered = !partial && series.firstDay <= w.prevStart && series.lastDay >= w.prevEnd;
  const prev = prevCovered ? sumRange(series.days, w.prevStart, w.prevEnd) : null;
  const deltaPct = prev !== null && prev > 0 ? (value / prev - 1) * 100 : null;
  return { key: w.key, value, from, through, partial, prev, deltaPct };
}

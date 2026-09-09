export function fmtUsd(n: number | null | undefined, opts: { digits?: number } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [div, suffix] of units) {
    if (abs >= div) {
      const v = n / div;
      const digits = opts.digits ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
      return `$${v.toFixed(digits)}${suffix}`;
    }
  }
  return `$${n.toFixed(0)}`;
}

export function fmtPct(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "–";
  const sign = p > 0 ? "+" : "";
  return `${sign}${Math.abs(p) >= 100 ? p.toFixed(0) : p.toFixed(1)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDay(day: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${opts.year ? ` ${y}` : ""}`;
}

export function fmtRange(from: string, through: string): string {
  if (from === through) return fmtDay(from, { year: true });
  const sameYear = from.slice(0, 4) === through.slice(0, 4);
  return `${fmtDay(from, { year: !sameYear })} – ${fmtDay(through, { year: true })}`;
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", { timeZone: "UTC", hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " UTC";
}

export function fmtShare(p: number | null | undefined, digits = 1): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "–";
  return `${p.toFixed(digits)}%`;
}

export function fmtPp(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "–";
  return `${p > 0 ? "+" : ""}${p.toFixed(1)} pp`;
}

/** Signed compact USD: +$1.2M / −$340K / $0. */
export function fmtSigned(v: number): string {
  if (v === 0) return "$0";
  return `${v > 0 ? "+" : "−"}${fmtUsd(Math.abs(v))}`;
}

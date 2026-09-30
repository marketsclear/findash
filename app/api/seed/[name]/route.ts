import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { refreshMode } from "@/lib/dashboard";

/**
 * Development-only drop box for tables that can only be read in a real browser (the sites block
 * non-browser clients, and their CSP blocks fetch() to other origins), so the browser tab navigates here:
 *   GET /api/seed/<name>?part=<n>&d=<url-encoded JSON>
 * Each part is written to data/<name>-seed.part-<n>.json for a merge script to pick up:
 *   farside     -> scripts/etf-seed-farside.ts   (ETF flow history)
 *   hl-buybacks -> scripts/hl-seed-buybacks.ts   (Hyperliquid Assistance Fund buyback history)
 * Disabled on deployments (external refresh mode).
 */
const NAMES = new Set(["farside", "hl-buybacks"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (refreshMode() !== "inprocess") return NextResponse.json({ error: "disabled" }, { status: 403 });
  const { name } = await params;
  if (!NAMES.has(name)) return NextResponse.json({ error: "unknown seed" }, { status: 404 });
  const part = req.nextUrl.searchParams.get("part");
  const raw = req.nextUrl.searchParams.get("d");
  if (!part || !/^\d+$/.test(part) || !raw) return NextResponse.json({ error: "part and d are required" }, { status: 400 });
  const body = JSON.parse(raw) as unknown;
  const dir = process.env.FINDASH_DATA_DIR ?? path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${name}-seed.part-${part}.json`), JSON.stringify({ capturedAt: new Date().toISOString(), body }));
  const rows = Array.isArray(body) ? body.length : Array.isArray((body as { out?: unknown[] })?.out) ? (body as { out: unknown[] }).out.length : 0;
  return new NextResponse(`stored ${name} part ${part}: ${rows} rows`, { headers: { "content-type": "text/plain" } });
}

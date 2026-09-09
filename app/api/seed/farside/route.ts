import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { refreshMode } from "@/lib/dashboard";

/**
 * Development-only drop box for the Farside flow table (the site blocks non-browser clients, and its
 * CSP blocks fetch() to other origins, so a browser tab on farside.co.uk navigates here instead):
 *   GET /api/seed/farside?part=<n>&d=<url-encoded JSON {want, out}>
 * Each part is written to data/farside-seed.part-<n>.json; scripts/etf-seed-farside.ts merges them.
 * Disabled on deployments (external refresh mode).
 */
export async function GET(req: NextRequest) {
  if (refreshMode() !== "inprocess") return NextResponse.json({ error: "disabled" }, { status: 403 });
  const part = req.nextUrl.searchParams.get("part");
  const raw = req.nextUrl.searchParams.get("d");
  if (!part || !raw) return NextResponse.json({ error: "part and d are required" }, { status: 400 });
  const body = JSON.parse(raw) as { want: string[]; out: (string | number | null)[][] };
  if (!Array.isArray(body.want) || !Array.isArray(body.out)) return NextResponse.json({ error: "bad payload" }, { status: 400 });
  const dir = process.env.FINDASH_DATA_DIR ?? path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `farside-seed.part-${part}.json`), JSON.stringify({ capturedAt: new Date().toISOString(), ...body }));
  return new NextResponse(`stored part ${part}: ${body.out.length} rows`, { headers: { "content-type": "text/plain" } });
}

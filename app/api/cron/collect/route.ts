import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const REPO = process.env.GITHUB_DISPATCH_REPO ?? "marketsclear/findash";
const WORKFLOW = "collect.yml";

function bearerMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * Starts the "Collect market data" workflow on GitHub Actions. Called by Vercel Cron (vercel.json) in the
 * hour after 00:00 UTC and again after 03:00 UTC, because GitHub starts scheduled workflows hours late and
 * drops most of them, and a day only appears on the page once a collection has run after it closed.
 *
 * Needs two environment variables on Vercel:
 *  - CRON_SECRET: Vercel sends it as `Authorization: Bearer <secret>` with every cron invocation.
 *  - GITHUB_DISPATCH_TOKEN: fine-grained personal access token limited to this repository with
 *    "Actions: read and write", used only to create the workflow_dispatch event.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!secret || !token) {
    return NextResponse.json({ dispatched: false, error: "not configured: set CRON_SECRET and GITHUB_DISPATCH_TOKEN" }, { status: 503 });
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ dispatched: false, error: "bad cron secret" }, { status: 401 });
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "findash-cron",
    },
    body: JSON.stringify({ ref: "main" }),
    cache: "no-store",
  });
  const schedule = req.headers.get("x-vercel-cron-schedule");
  if (res.ok) {
    console.log(`cron: dispatched ${WORKFLOW} on ${REPO}${schedule ? ` (schedule ${schedule})` : ""}`);
    return NextResponse.json({ dispatched: true, workflow: WORKFLOW, at: new Date().toISOString() });
  }
  const detail = (await res.text()).slice(0, 300);
  console.error(`cron: GitHub refused the dispatch of ${WORKFLOW}: ${res.status} ${detail}`);
  return NextResponse.json({ dispatched: false, status: res.status, detail }, { status: 502 });
}

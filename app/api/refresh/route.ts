import { NextResponse } from "next/server";
import { getRefreshState, startRefresh } from "@/lib/collect";
import { refreshMode } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getRefreshState());
}

export async function POST() {
  if (refreshMode() === "external") {
    return NextResponse.json({ error: "Data is refreshed by a scheduled job on this deployment." }, { status: 409 });
  }
  const wasRunning = getRefreshState().running;
  void startRefresh();
  return NextResponse.json({ started: !wasRunning, ...getRefreshState() });
}

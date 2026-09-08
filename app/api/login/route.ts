import { NextResponse, type NextRequest } from "next/server";
import { passwordMatches, SESSION_COOKIE, sessionToken } from "@/lib/session";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const from = String(form.get("from") ?? "/");
  const target = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  if (!passwordMatches(password)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", target);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, 303);
  }
  const res = NextResponse.redirect(new URL(target, req.url), 303);
  res.cookies.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}

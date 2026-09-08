import { NextResponse, type NextRequest } from "next/server";
import { passwordRequired, SESSION_COOKIE, validSession } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/api/login"];

export default function proxy(req: NextRequest) {
  if (!passwordRequired()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (validSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL("/login", req.url);
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

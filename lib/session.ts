import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Optional shared-password gate. Set DASHBOARD_PASSWORD to require it; leave unset for a public page.
 * The cookie holds an HMAC of a fixed label keyed by the password, so it is valid until the
 * password changes and never contains the password itself.
 */
export const SESSION_COOKIE = "findash_session";

export function passwordRequired(): boolean {
  return !!process.env.DASHBOARD_PASSWORD;
}

export function sessionToken(): string {
  return createHmac("sha256", process.env.DASHBOARD_PASSWORD ?? "").update("findash-session-v1").digest("hex");
}

export function validSession(cookie: string | undefined): boolean {
  if (!passwordRequired()) return true;
  if (!cookie) return false;
  const expected = Buffer.from(sessionToken());
  const got = Buffer.from(cookie);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function passwordMatches(input: string): boolean {
  const expected = Buffer.from(process.env.DASHBOARD_PASSWORD ?? "");
  const got = Buffer.from(input);
  return expected.length > 0 && got.length === expected.length && timingSafeEqual(got, expected);
}

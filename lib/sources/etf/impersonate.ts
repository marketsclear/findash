import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Requests carried out by scripts/impersonate_fetch.py with a Chrome TLS fingerprint and a shared
 * cookie jar. Needs python3 with the curl_cffi package (see .github/workflows/etf.yml).
 */
export interface ImpersonatedRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string | { $json: string }>;
  json?: unknown;
  timeout?: number;
}

export interface ImpersonatedResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

const SCRIPT = path.join(process.cwd(), "scripts", "impersonate_fetch.py");

export function impersonateFetch(requests: ImpersonatedRequest[], impersonate = "chrome"): Promise<ImpersonatedResponse[]> {
  const python = process.env.FINDASH_PYTHON ?? "python3";
  return new Promise((resolve, reject) => {
    const child = spawn(python, [SCRIPT], { env: process.env });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill(), 180_000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => { clearTimeout(timer); reject(new Error(`impersonate_fetch.py: ${err.message}`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`impersonate_fetch.py exited ${code}: ${stderr.slice(-300)}`));
      try { resolve(JSON.parse(stdout) as ImpersonatedResponse[]); } catch { reject(new Error(`impersonate_fetch.py: bad output ${stdout.slice(0, 120)}`)); }
    });
    child.stdin.end(JSON.stringify({ impersonate, requests }));
  });
}

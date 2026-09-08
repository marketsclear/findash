/** fetch with timeout and exponential backoff on 429 / 403 / 405 / 5xx / network errors. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 8;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      // 403/405 with an HTML body is the CDN bot challenge Lighter serves when a client goes too fast.
      if (res.status === 429 || res.status === 403 || res.status === 405 || res.status >= 500) {
        throw new RetryableError(res.status, `${res.status} ${res.statusText} for ${url}`);
      }
      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText} for ${url}: ${(await res.text()).slice(0, 200)}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      const throttled = err instanceof RetryableError && err.status !== undefined && err.status < 500;
      const retryable = err instanceof RetryableError || isNetworkError(err);
      if (!retryable || attempt >= retries) throw err;
      const base = Math.min(60_000, 2000 * 2 ** attempt);
      const delay = Math.max(throttled ? 15_000 : 0, base) + Math.random() * 1000;
      await sleep(delay);
      attempt++;
    }
  }
}

class RetryableError extends Error {
  constructor(public status: number | undefined, message: string) {
    super(message);
  }
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError" || /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/.test(err.message);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run `fn` over `items` with bounded concurrency, preserving order of results. */
export async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Sliding-window budget: at most `capacity` units per `windowMs`.
 * `take(weight)` resolves once the request fits in the window.
 */
export class RateLimiter {
  private log: { at: number; weight: number }[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(private capacity: number, private windowMs = 60_000) {}

  take(weight = 1): Promise<void> {
    const run = async () => {
      for (;;) {
        const now = Date.now();
        this.log = this.log.filter((e) => now - e.at < this.windowMs);
        const used = this.log.reduce((s, e) => s + e.weight, 0);
        if (used + weight <= this.capacity || this.log.length === 0) {
          this.log.push({ at: now, weight });
          return;
        }
        await sleep(Math.max(50, this.log[0].at + this.windowMs - now));
      }
    };
    const next = this.queue.then(run);
    this.queue = next.catch(() => {});
    return next;
  }
}

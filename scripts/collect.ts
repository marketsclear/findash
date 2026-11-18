import { startRefresh, getRefreshState } from "../lib/collect";

/**
 * pnpm collect [dex|etf|all] [--await-close]
 * --await-close: when started just after 00:00 UTC, wait for Lighter to publish the day that just closed.
 * The scheduled workflow always passes it; at any other time of day it does nothing.
 */
async function main() {
  const t0 = Date.now();
  const args = process.argv.slice(2);
  const scope = (args.find((a) => !a.startsWith("--")) as "dex" | "etf" | "all" | undefined) ?? "dex";
  await startRefresh((msg) => console.log(msg), scope, { awaitClose: args.includes("--await-close") });
  const state = getRefreshState();
  console.log(`finished in ${Math.round((Date.now() - t0) / 1000)}s${state.error ? ` with errors: ${state.error}` : ""}`);
  process.exit(state.error ? 1 : 0);
}

void main();

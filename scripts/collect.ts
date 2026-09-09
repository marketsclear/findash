import { startRefresh, getRefreshState } from "../lib/collect";

async function main() {
  const t0 = Date.now();
  const scope = (process.argv[2] as "dex" | "etf" | "all" | undefined) ?? "dex";
  await startRefresh((msg) => console.log(msg), scope);
  const state = getRefreshState();
  console.log(`finished in ${Math.round((Date.now() - t0) / 1000)}s${state.error ? ` with errors: ${state.error}` : ""}`);
  process.exit(state.error ? 1 : 0);
}

void main();

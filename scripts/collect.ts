import { startRefresh, getRefreshState } from "../lib/collect";

async function main() {
  const t0 = Date.now();
  await startRefresh((msg) => console.log(msg));
  const state = getRefreshState();
  console.log(`finished in ${Math.round((Date.now() - t0) / 1000)}s${state.error ? ` with errors: ${state.error}` : ""}`);
  process.exit(state.error ? 1 : 0);
}

void main();

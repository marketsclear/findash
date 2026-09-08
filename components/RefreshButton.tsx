"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface State { running: boolean; log: string[]; error: string | null }

export function RefreshButton({ initial }: { initial: State }) {
  const router = useRouter();
  const [state, setState] = useState<State>(initial);
  const wasRunning = useRef(initial.running);

  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(async () => {
      const next: State = await fetch("/api/refresh", { cache: "no-store" }).then((r) => r.json());
      setState(next);
    }, 3000);
    return () => clearInterval(id);
  }, [state.running]);

  useEffect(() => {
    if (wasRunning.current && !state.running) router.refresh();
    wasRunning.current = state.running;
  }, [state.running, router]);

  async function start() {
    setState((s) => ({ ...s, running: true }));
    const next: State = await fetch("/api/refresh", { method: "POST" }).then((r) => r.json());
    setState(next);
  }

  const last = state.log[state.log.length - 1]?.slice(9);
  return (
    <div className="flex items-center gap-3 text-sm">
      {state.running ? (
        <span className="text-ink-2" aria-live="polite">Refreshing… {last}</span>
      ) : state.error ? (
        <span className="text-bad" title={state.error}>Last refresh had errors</span>
      ) : null}
      <button
        type="button"
        onClick={start}
        disabled={state.running}
        className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-ink hover:bg-wash disabled:opacity-50"
      >
        Refresh data
      </button>
    </div>
  );
}

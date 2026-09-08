export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from : "/";
  const error = params.error === "1";
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <h1 className="text-lg font-semibold">Perp DEX monitor</h1>
      <p className="mt-1 text-sm text-ink-2">Enter the dashboard password.</p>
      <form method="post" action="/api/login" className="mt-6 space-y-3">
        <input type="hidden" name="from" value={from} />
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          aria-label="Password"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus:ring-2 focus:ring-series-1"
        />
        {error && <p className="text-sm text-bad">Wrong password.</p>}
        <button type="submit" className="w-full rounded-md bg-ink px-3 py-2 font-medium text-page">
          Continue
        </button>
      </form>
    </main>
  );
}

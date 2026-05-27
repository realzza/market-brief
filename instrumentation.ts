// Next.js calls register() once per server boot, BEFORE handling any
// requests. Use it to start the background tweet-fetch scheduler.
//
// Gated to the Node.js runtime — the Edge runtime can't run
// `better-sqlite3` and doesn't keep long-lived state anyway.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}

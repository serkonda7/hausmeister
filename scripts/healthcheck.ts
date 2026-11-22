// Used by the Docker healthcheck: exits 0 when the app answers /health.
export {};

const port = process.env.PORT ?? "3000";
try {
  const res = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(3000),
  });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}

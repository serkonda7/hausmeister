// The per-request CSP nonce (DESIGN §8.4). src/server.ts generates it and runs
// the request inside an AsyncLocalStorage kept on globalThis; the router reads
// it here while rendering the shell and hands it to every script (`ssr.nonce`).
// In the browser the router picks it up from the `csp-nonce` meta tag itself.
type Store = { getStore(): string | undefined };

export function currentCspNonce(): string | undefined {
  if (typeof window !== "undefined") return undefined;
  return (globalThis as { __hausmeisterCsp?: Store }).__hausmeisterCsp?.getStore();
}

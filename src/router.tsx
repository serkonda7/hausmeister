// Must stay the first import: configures Zod before any schema is built.
import "./lib/zod-config";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createRouter } from "@tanstack/solid-router";
import { currentCspNonce } from "./lib/csp-nonce";
import { goToLogin, isSignedOutError } from "./lib/error-text";
import { routeTree } from "./routeTree.gen";

export type RouterContext = { queryClient: QueryClient };

export function getRouter() {
  // One QueryClient per router (the server only builds one to render the shell).
  // A 401 from any server function in the browser means the session is gone
  // (signed out elsewhere, disabled, password reset): go to /login.
  const onError = (err: unknown) => {
    if (typeof window !== "undefined" && isSignedOutError(err)) goToLogin();
  };
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err) => !isSignedOutError(err) && count < 1,
      },
    },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient } satisfies RouterContext,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Loaders should read through queryClient.ensureQueryData; Query owns caching.
    defaultPreloadStaleTime: 0,
    // CSP nonce for the shell's inline scripts (undefined in the browser and in dev).
    ssr: { nonce: currentCspNonce() },
    Wrap: (props) => (
      <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
    ),
  });
  return router;
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

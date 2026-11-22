// Must stay the first import: configures Zod before any schema is built.
import "./lib/zod-config";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { createRouter } from "@tanstack/solid-router";
import { currentCspNonce } from "./lib/csp-nonce";
import { goToLogin, isSignedOutError } from "./lib/error-text";
import { sessionQuery } from "./lib/session-query";
import { routeTree } from "./routeTree.gen";
import type { SessionUser } from "./server/auth/functions";

export type RouterContext = {
  queryClient: QueryClient;
  /** Starts loading the code of these matches (the root's beforeLoad calls it). */
  preloadRouteChunks: (matches: { routeId: string }[]) => void;
};

/** The router's own state handed from the server-rendered shell to the browser. */
type Dehydrated = { session?: SessionUser | null };

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
  // Route chunks load only after every beforeLoad has finished; starting them
  // from the root's beforeLoad overlaps the download with the session check.
  const preloadRouteChunks = (matches: { routeId: string }[]) => {
    if (typeof window === "undefined") return;
    for (const match of matches) {
      const route = router.routesById[match.routeId as keyof typeof router.routesById];
      // Errors surface (and are retried) when the router loads the chunk itself.
      if (route) router.loadRouteChunk(route)?.catch(() => {});
    }
  };
  const router = createRouter({
    routeTree,
    context: { queryClient, preloadRouteChunks } satisfies RouterContext,
    // The root's beforeLoad runs on the server (ssr "data-only"); hand its
    // session result to the browser's Query cache as well.
    dehydrate: (): Dehydrated => ({ session: queryClient.getQueryData(sessionQuery().queryKey) }),
    hydrate: (data: Dehydrated) => {
      if (data.session !== undefined)
        queryClient.setQueryData(sessionQuery().queryKey, data.session);
    },
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

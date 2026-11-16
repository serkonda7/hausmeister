import { QueryClient } from "@tanstack/solid-query";
import { createRouter } from "@tanstack/solid-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/solid-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export type RouterContext = { queryClient: QueryClient };

export function getRouter() {
  // One QueryClient per router: per request on the server, one in the browser.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient } satisfies RouterContext,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Loaders should read through queryClient.ensureQueryData; Query owns caching.
    defaultPreloadStaleTime: 0,
  });
  // Dehydrates queries fetched during SSR, hydrates them in the browser and
  // wraps the app in <QueryClientProvider>.
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

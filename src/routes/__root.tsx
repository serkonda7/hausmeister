/// <reference types="vite/client" />
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/solid-router";
import { type JSX, onMount } from "solid-js";
import { HydrationScript } from "solid-js/web";
import { Toaster } from "~/components/ui/toast";
import { markHydrated } from "~/lib/hydrated";
import { sessionQuery } from "~/lib/session-query";
import { m } from "~/paraglide/messages";
import type { RouterContext } from "~/router";
import appCss from "~/styles/app.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  // Every route can read `context.user` (SessionUser | null).
  beforeLoad: async ({ context }) => ({
    user: await context.queryClient.fetchQuery(sessionQuery()),
  }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#15181d" },
      { title: m.app_name() },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: () => (
    <main class="mx-auto grid max-w-3xl justify-items-start gap-3 p-4">
      <p>{m.error_not_found()}</p>
      {/* A plain link: works even when the page failed before hydration. */}
      <a href="/" class="text-primary underline underline-offset-4">
        {m.error_back_home()}
      </a>
    </main>
  ),
  component: () => (
    <RootDocument>
      <Outlet />
    </RootDocument>
  ),
});

function RootDocument(props: { children: JSX.Element }) {
  // Every page, including login and invite (outside the app shell).
  onMount(markHydrated);
  return (
    <html lang="de">
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body class="min-h-dvh antialiased">
        {props.children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}

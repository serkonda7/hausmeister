/// <reference types="vite/client" />
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/solid-router";
import { HydrationScript } from "solid-js/web";
import type { JSX } from "solid-js";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hausmeister" },
    ],
  }),
  component: () => (
    <RootDocument>
      <Outlet />
    </RootDocument>
  ),
});

function RootDocument(props: { children: JSX.Element }) {
  return (
    <html lang="de">
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body
        style={{ "font-family": "system-ui, sans-serif", margin: 0, padding: "16px" }}
      >
        {props.children}
        <Scripts />
      </body>
    </html>
  );
}

import { createFileRoute } from "@tanstack/solid-router";
import { createServerFn } from "@tanstack/solid-start";

const getServerInfo = createServerFn({ method: "GET" }).handler(() => ({
  now: new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
  bun: Bun.version,
}));

export const Route = createFileRoute("/")({
  loader: () => getServerInfo(),
  component: Home,
});

function Home() {
  const info = Route.useLoaderData();
  return (
    <main>
      <h1>Hallo 👋</h1>
      <p>
        Hausmeister läuft. Serverzeit: {info().now} · Bun {info().bun}
      </p>
    </main>
  );
}

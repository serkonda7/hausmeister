import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { AppShell } from "~/components/app-shell";

// Every page under src/routes/_authed/ requires a signed-in, active user.
// Signed-out requests (SSR or client navigation) are redirected to /login.
// This guards pages only; server functions must still use authMiddleware.
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user: context.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const ctx = Route.useRouteContext();
  return (
    <AppShell user={ctx().user}>
      <Outlet />
    </AppShell>
  );
}

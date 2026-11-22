import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { AppShell } from "~/components/app-shell";
import { unreadNotificationsQuery } from "~/lib/notification-queries";

// Every page under src/routes/_authed/ requires a signed-in, active user.
// Signed-out visitors are redirected to /login.
// This guards pages only; server functions must still use authMiddleware.
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user: context.user };
  },
  // The top bar reads the unread count while rendering; started here, next to
  // the page's own loader, so the page doesn't wait for it after rendering.
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(unreadNotificationsQuery()).catch(() => {});
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

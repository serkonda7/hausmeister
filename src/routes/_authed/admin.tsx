import { createFileRoute, Link, notFound, Outlet, useLocation } from "@tanstack/solid-router";
import { For } from "solid-js";
import { ADMIN_AREA_ROLES, sectionsFor } from "~/lib/admin-sections";
import { cn } from "~/lib/cn";
import { m } from "~/paraglide/messages";

// Admin area layout with section navigation. Guests cannot open it; members
// see only the sections their role allows (see ~/lib/admin-sections.ts).
// Each section route guards itself too, and its server functions check roles.
export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: ({ context }) => {
    if (!ADMIN_AREA_ROLES.includes(context.user.role)) throw notFound();
  },
  head: () => ({ meta: [{ title: `${m.admin_nav_title()} · ${m.app_name()}` }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const ctx = Route.useRouteContext();
  const location = useLocation();
  const sections = () => sectionsFor(ctx().user.role);
  const active = (to: string) => location().pathname.startsWith(to);
  return (
    <div class="grid gap-4">
      <h1 class="text-2xl font-semibold">{m.admin_nav_title()}</h1>
      <nav aria-label={m.admin_nav_sections()} class="-mx-4 overflow-x-auto px-4">
        <ul class="flex gap-1 border-b">
          <For each={sections()}>
            {(s) => (
              <li>
                <Link
                  to={s.to as "/"}
                  class={cn(
                    "-mb-px inline-flex h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium",
                    active(s.to)
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={active(s.to) ? "page" : undefined}
                >
                  {s.label()}
                </Link>
              </li>
            )}
          </For>
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}

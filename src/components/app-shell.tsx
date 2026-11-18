import { useQuery } from "@tanstack/solid-query";
import { Link, useLocation, useNavigate } from "@tanstack/solid-router";
import { For, type JSX, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/cn";
import { unreadNotificationsQuery } from "~/lib/notification-queries";
import { m } from "~/paraglide/messages";
import type { SessionUser } from "~/server/auth/functions";

type NavItem = {
  to: "/" | "/items" | "/locations" | "/admin";
  label: () => string;
  icon: string;
  roles?: SessionUser["role"][];
};

// Guests see Start, items and locations (only what is shared with them).
const NAV: NavItem[] = [
  { to: "/", label: m.nav_home, icon: "⌂" },
  { to: "/items", label: m.nav_items, icon: "▦" },
  { to: "/locations", label: m.nav_locations, icon: "⌖" },
  { to: "/admin", label: m.nav_admin, icon: "⚙", roles: ["admin", "member"] },
];

export async function logout() {
  await authClient.signOut();
  window.location.assign("/login");
}

/** The inbox with its unread count (polled every two minutes and on focus). */
function InboxLink() {
  const q = useQuery(() => unreadNotificationsQuery());
  const unread = () => q.data?.unread ?? 0;
  return (
    <Link
      to="/notifications"
      class="relative inline-flex size-11 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={
        unread() ? m.notifications_link_unread({ count: unread() }) : m.notifications_title()
      }
      data-testid="inbox-link"
    >
      <span aria-hidden="true" class="text-xl leading-none">
        ✉
      </span>
      <Show when={unread() > 0}>
        <span
          aria-hidden="true"
          class="absolute right-1 top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-xs font-semibold leading-5 text-destructive-foreground"
          data-testid="inbox-count"
        >
          {unread() > 99 ? "99+" : unread()}
        </span>
      </Show>
    </Link>
  );
}

/** Phone-first layout: top bar, content, bottom tab bar (side links from `md`). */
export function AppShell(props: { user: SessionUser; children: JSX.Element }) {
  const location = useLocation();
  const navigate = useNavigate();
  const items = () => NAV.filter((n) => !n.roles || n.roles.includes(props.user.role));
  const isActive = (to: string) =>
    to === "/" ? location().pathname === "/" : location().pathname.startsWith(to);

  return (
    <div class="flex min-h-dvh flex-col">
      <header class="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div class="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link to="/" class="text-lg font-semibold">
            {m.app_name()}
          </Link>
          <nav class="hidden flex-1 gap-1 md:flex" aria-label={m.nav_menu()}>
            <For each={items()}>
              {(item) => (
                <Link
                  to={item.to}
                  class={cn(
                    "rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
                    isActive(item.to) && "bg-accent",
                  )}
                  aria-current={isActive(item.to) ? "page" : undefined}
                >
                  {item.label()}
                </Link>
              )}
            </For>
          </nav>
          <div class="ml-auto flex items-center gap-1">
            <InboxLink />
            <DropdownMenu>
              <DropdownMenuTrigger as={Button} variant="ghost" size="sm">
                {props.user.displayName}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>@{props.user.username}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate({ to: "/account" })}>
                  {m.account_nav()}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate({ to: "/loans" })}>
                  {m.loans_title()}
                </DropdownMenuItem>
                <Show when={props.user.role !== "guest"}>
                  <DropdownMenuItem onSelect={() => navigate({ to: "/contacts" })}>
                    {m.contacts_title()}
                  </DropdownMenuItem>
                </Show>
                <DropdownMenuItem onSelect={logout}>{m.nav_logout()}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-4 pb-24 md:pb-4">{props.children}</main>

      <nav
        class="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label={m.nav_menu()}
      >
        <ul class="grid" style={{ "grid-template-columns": `repeat(${items().length}, 1fr)` }}>
          <For each={items()}>
            {(item) => (
              <li>
                <Link
                  to={item.to}
                  class={cn(
                    "flex h-16 flex-col items-center justify-center gap-0.5 text-xs",
                    isActive(item.to) ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                  aria-current={isActive(item.to) ? "page" : undefined}
                >
                  <span aria-hidden="true" class="text-xl leading-none">
                    {item.icon}
                  </span>
                  {item.label()}
                </Link>
              </li>
            )}
          </For>
        </ul>
      </nav>
    </div>
  );
}

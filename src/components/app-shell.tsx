// App shell for signed-in pages (layout after conex): a top bar whose left
// corner (brand + round collapse knob) is exactly as wide as the sidebar below
// it, a grouped sidebar that collapses to an icon rail (remembered per
// browser), and the page. Phones get a bottom tab bar instead; its "Menü"
// opens the full navigation as a drawer. Entries come from src/lib/nav.ts.
import * as DialogPrimitive from "@kobalte/core/dialog";
import { useQuery } from "@tanstack/solid-query";
import { Link, useLocation, useNavigate } from "@tanstack/solid-router";
import { createEffect, createSignal, createUniqueId, For, type JSX, on, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Icon } from "~/components/ui/icons";
import { inputClass } from "~/components/ui/input";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/cn";
import { roleLabel } from "~/lib/labels";
import {
  canAdd,
  isActivePath,
  NAV_HOME,
  type NavEntry,
  type NavGroup,
  navFor,
  TAB_BAR,
} from "~/lib/nav";
import { unreadNotificationsQuery } from "~/lib/notification-queries";
import { m } from "~/paraglide/messages";
import type { SessionUser } from "~/server/auth/functions";

export async function logout() {
  await authClient.signOut();
  window.location.assign("/login");
}

const COLLAPSED_KEY = "hausmeister:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

// One per browser tab; the shell is rendered in the browser only (SPA).
const [collapsed, setCollapsedSignal] = createSignal(readCollapsed());

function setCollapsed(next: boolean) {
  setCollapsedSignal(next);
  try {
    window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/** One sidebar row: icon and label, plus the quick-add "+" (hidden on the rail). */
function NavRow(props: {
  entry: NavEntry;
  role: SessionUser["role"];
  rail: boolean;
  touch: boolean;
}) {
  const location = useLocation();
  const active = () => isActivePath(location().pathname, props.entry.to);
  return (
    <div
      class={cn(
        "group relative flex items-center rounded-md border border-transparent hover:bg-primary-tint",
        active() && "border-border bg-primary-tint",
      )}
    >
      <Link
        to={props.entry.to as "/"}
        class={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 text-sm",
          props.touch ? "min-h-11" : "min-h-9",
          props.rail && "justify-center px-0",
          active() ? "font-semibold text-foreground" : "text-foreground/90",
          focusRing,
        )}
        aria-current={active() ? "page" : undefined}
        title={props.rail ? props.entry.label() : undefined}
      >
        <Icon name={props.entry.icon} class={active() ? "text-primary" : "text-muted-foreground"} />
        <span class={props.rail ? "sr-only" : "truncate"}>{props.entry.label()}</span>
      </Link>
      <Show when={!props.rail && props.entry.add && canAdd(props.entry, props.role)}>
        <Link
          to={props.entry.add?.to as "/"}
          class={cn(
            "mr-1 grid shrink-0 place-items-center rounded border border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            props.touch
              ? "size-10"
              : "size-7 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100",
            active() && "opacity-100",
            focusRing,
          )}
          aria-label={props.entry.add?.label()}
          title={props.entry.add?.label()}
        >
          <Icon name="plus" size={16} />
        </Link>
      </Show>
    </div>
  );
}

/** Labeled group; on the rail its heading gives way to a divider. */
function NavGroupBlock(props: {
  group: NavGroup;
  role: SessionUser["role"];
  rail: boolean;
  touch: boolean;
}) {
  const id = createUniqueId();
  return (
    <div>
      <Show when={props.rail}>
        <hr class="mx-2 my-1.5" />
      </Show>
      <div
        id={id}
        class={cn(
          "px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground",
          props.rail && "sr-only",
        )}
      >
        {props.group.label()}
      </div>
      <ul aria-labelledby={id} class="grid gap-0.5">
        <For each={props.group.entries}>
          {(entry) => (
            <li>
              <NavRow entry={entry} role={props.role} rail={props.rail} touch={props.touch} />
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

/** The grouped main navigation (sidebar and drawer). */
function MainNav(props: { user: SessionUser; rail?: boolean; touch?: boolean }) {
  const rail = () => props.rail ?? false;
  const touch = () => props.touch ?? false;
  return (
    <nav
      aria-label={m.nav_main()}
      class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2 [scrollbar-width:thin]"
    >
      <NavRow entry={NAV_HOME} role={props.user.role} rail={rail()} touch={touch()} />
      <For each={navFor(props.user.role)}>
        {(group) => (
          <NavGroupBlock group={group} role={props.user.role} rail={rail()} touch={touch()} />
        )}
      </For>
    </nav>
  );
}

/**
 * Top-left corner of the top bar, as wide as the sidebar: the brand and the
 * round toggle sitting on the sidebar's edge line (its ring in the bar's
 * colour cuts the line). Collapsed, only the toggle remains.
 */
function SidebarCorner() {
  return (
    <div
      class={cn(
        "relative hidden shrink-0 items-center self-stretch border-r pl-4 pr-6 md:flex",
        collapsed() ? "w-(--sidebar-rail-width)" : "w-(--sidebar-width)",
      )}
    >
      <Show when={!collapsed()}>
        <Link to="/" class={cn("truncate rounded-sm text-lg font-bold", focusRing)}>
          {m.app_name()}
        </Link>
      </Show>
      <button
        type="button"
        class={cn(
          "absolute -right-3 top-1/2 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-input bg-popover text-muted-foreground shadow-[0_0_0_3px_var(--color-card)] hover:bg-accent hover:text-foreground",
          focusRing,
        )}
        aria-expanded={!collapsed()}
        aria-label={collapsed() ? m.nav_expand() : m.nav_collapse()}
        title={collapsed() ? m.nav_expand() : m.nav_collapse()}
        onClick={() => setCollapsed(!collapsed())}
      >
        <Icon name={collapsed() ? "chevrons-right" : "chevrons-left"} size={14} />
      </button>
    </div>
  );
}

/** Search field of the top bar (wide screens): opens the item list with `q`. */
function QuickSearch() {
  const navigate = useNavigate();
  const [q, setQ] = createSignal("");
  return (
    <form
      class="hidden min-w-0 max-w-sm flex-1 md:flex"
      onSubmit={(e) => {
        e.preventDefault();
        const text = q().trim();
        void navigate({ to: "/items", search: (text ? { q: text } : {}) as never });
      }}
    >
      <label for="shell-q" class="sr-only">
        {m.nav_search()}
      </label>
      <div class="relative w-full">
        <Icon
          name="search"
          size={16}
          class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id="shell-q"
          type="search"
          class={cn(inputClass, "h-9 border-border bg-background pl-8 text-sm")}
          placeholder={m.nav_search_placeholder()}
          enterkeyhint="search"
          autocomplete="off"
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
      </div>
    </form>
  );
}

/** The inbox with its unread count (polled every two minutes and on focus). */
function InboxLink() {
  const q = useQuery(() => unreadNotificationsQuery());
  const unread = () => q.data?.unread ?? 0;
  return (
    <Link
      to="/notifications"
      class={cn(
        "relative inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:size-9",
        focusRing,
      )}
      activeProps={{ class: "text-foreground" }}
      aria-label={
        unread() ? m.notifications_link_unread({ count: unread() }) : m.notifications_title()
      }
      title={m.notifications_title()}
      data-testid="inbox-link"
    >
      <Icon name="bell" />
      <Show when={unread() > 0}>
        <span
          aria-hidden="true"
          class="absolute right-0.5 top-0.5 min-w-5 rounded-full bg-destructive px-1 text-center text-xs font-semibold leading-5 text-destructive-foreground md:-right-1 md:-top-1"
          data-testid="inbox-count"
        >
          {unread() > 99 ? "99+" : unread()}
        </span>
      </Show>
    </Link>
  );
}

function UserMenu(props: { user: SessionUser }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={Button}
        variant="ghost"
        class="h-11 gap-2 px-2 md:h-10"
        title={props.user.displayName}
      >
        <Icon name="user-circle" size={22} class="text-muted-foreground" />
        <span class="hidden min-w-0 flex-col items-start text-left leading-tight md:flex">
          <span class="max-w-40 truncate">{props.user.displayName}</span>
          <span class="text-xs font-normal text-muted-foreground">
            {roleLabel(props.user.role)}
          </span>
        </span>
        <span class="sr-only md:hidden">{props.user.displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent class="min-w-48">
        <DropdownMenuLabel>@{props.user.username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: "/account" })}>
          <Icon name="user" size={18} class="text-muted-foreground" />
          {m.account_nav()}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={logout}>
          <Icon name="logout" size={18} class="text-muted-foreground" />
          {m.nav_logout()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopBar(props: { user: SessionUser }) {
  return (
    <header class="sticky top-0 z-40 flex h-(--topbar-height) items-center gap-3 border-b bg-card pr-2 pl-4 md:gap-4 md:pl-0 md:pr-3 print:hidden">
      <SidebarCorner />
      <Link to="/" class={cn("truncate rounded-sm text-lg font-bold md:hidden", focusRing)}>
        {m.app_name()}
      </Link>
      <QuickSearch />
      <div class="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
        <Show when={props.user.role !== "guest"}>
          <Link
            to="/items/new"
            class={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold md:h-9",
              "bg-primary-solid text-primary-solid-foreground hover:bg-primary-solid-hover",
              focusRing,
            )}
            aria-label={m.nav_add_item()}
            title={m.nav_add_item()}
          >
            <Icon name="plus" size={18} />
            <span class="hidden lg:inline">{m.nav_add_short()}</span>
          </Link>
        </Show>
        <InboxLink />
        <UserMenu user={props.user} />
      </div>
    </header>
  );
}

/** Phones: the most used pages plus "Menü", which opens the drawer. */
function TabBar(props: { menuOpen: boolean; onMenu: () => void; menuId: string }) {
  const location = useLocation();
  const cell =
    "flex h-16 w-full flex-col items-center justify-center gap-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  return (
    <nav
      class="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      aria-label={m.nav_quick()}
    >
      <ul class="grid grid-cols-5">
        <For each={TAB_BAR}>
          {(entry) => {
            const active = () => isActivePath(location().pathname, entry.to);
            return (
              <li>
                <Link
                  to={entry.to as "/"}
                  class={cn(
                    cell,
                    active() ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                  aria-current={active() ? "page" : undefined}
                >
                  <Icon name={entry.icon} size={22} />
                  {entry.label()}
                </Link>
              </li>
            );
          }}
        </For>
        <li>
          <button
            type="button"
            class={cn(cell, props.menuOpen ? "text-primary" : "text-muted-foreground")}
            aria-haspopup="dialog"
            aria-expanded={props.menuOpen}
            aria-controls={props.menuOpen ? props.menuId : undefined}
            onClick={() => props.onMenu()}
          >
            <Icon name="menu" size={22} />
            {m.nav_menu()}
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Phones: the full navigation as a drawer from the left. */
function MenuDrawer(props: {
  id: string;
  user: SessionUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class="hm-animate-fade fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          id={props.id}
          class="hm-animate-drawer fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r bg-card pb-[env(safe-area-inset-bottom)] shadow-lg focus-visible:outline-none"
        >
          <div class="flex h-(--topbar-height) shrink-0 items-center justify-between border-b pl-4 pr-2">
            <DialogPrimitive.Title class="text-lg font-bold">{m.nav_menu()}</DialogPrimitive.Title>
            <DialogPrimitive.CloseButton
              class={cn(
                "grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                focusRing,
              )}
              aria-label={m.common_close()}
            >
              <Icon name="x" size={22} />
            </DialogPrimitive.CloseButton>
          </div>
          <MainNav user={props.user} touch />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function AppShell(props: { user: SessionUser; children: JSX.Element }) {
  const location = useLocation();
  const menuId = createUniqueId();
  const [menuOpen, setMenuOpen] = createSignal(false);
  // A tap on an entry navigates; the drawer then gets out of the way.
  createEffect(
    on(
      () => location().pathname,
      () => setMenuOpen(false),
      { defer: true },
    ),
  );

  return (
    <div class="flex min-h-dvh flex-col">
      <a
        href="#main"
        class="sr-only z-50 rounded-md bg-popover px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        {m.nav_skip()}
      </a>
      <TopBar user={props.user} />
      <div class="flex flex-1">
        <div
          class={cn(
            "sticky top-(--topbar-height) hidden h-[calc(100dvh-var(--topbar-height))] shrink-0 flex-col border-r bg-card md:flex print:hidden",
            collapsed() ? "w-(--sidebar-rail-width)" : "w-(--sidebar-width)",
          )}
        >
          <MainNav user={props.user} rail={collapsed()} />
        </div>
        <main
          id="main"
          class="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8 print:max-w-none print:p-0"
        >
          {props.children}
        </main>
      </div>
      <TabBar menuOpen={menuOpen()} onMenu={() => setMenuOpen(true)} menuId={menuId} />
      <MenuDrawer id={menuId} user={props.user} open={menuOpen()} onOpenChange={setMenuOpen} />
    </div>
  );
}

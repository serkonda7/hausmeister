// The caller's inbox: low stock, loan requests and answers, transfers.
// Opening the page marks everything as read; entries that were unread keep
// their "neu" mark until the page is left.
import { useInfiniteQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createEffect, For, Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { formatDateTime } from "~/lib/format";
import { notificationsQuery } from "~/lib/notification-queries";
import { notificationText } from "~/lib/notifications";
import { actionErrorText } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import { markNotificationsReadFn } from "~/server/notifications/functions";

export const Route = createFileRoute("/_authed/notifications")({
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(notificationsQuery()),
  head: () => ({ meta: [{ title: `${m.notifications_title()} · ${m.app_name()}` }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const qc = useQueryClient();
  const q = useInfiniteQuery(() => notificationsQuery());
  const entries = () => q.data?.pages.flatMap((p) => p.entries) ?? [];
  let marked = false;
  createEffect(() => {
    if (marked || !q.data || !entries().some((e) => !e.read)) return;
    marked = true;
    void markNotificationsReadFn({ data: {} })
      .then(() => qc.invalidateQueries({ queryKey: ["notifications", "unread"] }))
      .catch(() => {
        marked = false;
      });
  });

  return (
    <div class="grid gap-4">
      <h1 class="text-2xl font-semibold">{m.notifications_title()}</h1>
      <Show when={q.isError}>
        <p role="alert" class="text-sm text-destructive">
          {actionErrorText(q.error)}
        </p>
      </Show>
      <Show when={q.isSuccess && entries().length === 0}>
        <p class="text-muted-foreground">{m.notifications_empty()}</p>
      </Show>
      <ul class="grid gap-2" aria-label={m.notifications_title()}>
        <For each={entries()}>
          {(n) => (
            <li
              class="grid gap-1 rounded-lg border bg-card p-3"
              classList={{ "border-primary": !n.read }}
              data-testid="notification"
            >
              <div class="flex flex-wrap items-start gap-2">
                <p class="min-w-0 flex-1 break-words">{notificationText(n)}</p>
                <Show when={!n.read}>
                  <Badge>{m.notifications_new()}</Badge>
                </Show>
              </div>
              <div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <time datetime={new Date(n.at).toISOString()}>{formatDateTime(n.at)}</time>
                <Show when={n.item}>
                  {(it) => (
                    <Link
                      to="/items/$itemId"
                      params={{ itemId: it().id }}
                      class="text-primary underline-offset-4 hover:underline"
                    >
                      {m.notifications_open_item()}
                    </Link>
                  )}
                </Show>
                <Show when={n.kind.startsWith("loan.") || n.kind.startsWith("transfer.")}>
                  <Link
                    to={"/loans" as "/"}
                    class="text-primary underline-offset-4 hover:underline"
                  >
                    {m.notifications_open_requests()}
                  </Link>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
      <Show when={q.hasNextPage}>
        <Button
          variant="outline"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          {m.notifications_more()}
        </Button>
      </Show>
    </div>
  );
}

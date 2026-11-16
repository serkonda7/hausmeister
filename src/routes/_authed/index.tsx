import { useQuery } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { roleLabel } from "~/lib/labels";
import { myProfileQuery } from "~/lib/session-query";
import { m } from "~/paraglide/messages";

export const Route = createFileRoute("/_authed/")({
  // Loader warms the Query cache (SSR-dehydrated); the component reads via useQuery.
  loader: ({ context }) => context.queryClient.ensureQueryData(myProfileQuery()),
  component: Home,
});

function Home() {
  const ctx = Route.useRouteContext();
  const profile = useQuery(() => myProfileQuery());
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{m.home_greeting({ name: ctx().user.displayName })}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent class="grid gap-2">
        <p class="text-muted-foreground">{m.home_intro()}</p>
        <Show when={profile.data}>
          {(p) => (
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{m.home_role({ role: roleLabel(p().role) })}</Badge>
              <span>
                {p().groups.length
                  ? m.home_groups({ groups: p().groups.join(", ") })
                  : m.home_no_groups()}
              </span>
            </div>
          )}
        </Show>
      </CardContent>
    </Card>
  );
}

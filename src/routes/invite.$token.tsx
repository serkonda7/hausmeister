import { queryOptions, useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createSignal, Match, Show, Switch } from "solid-js";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { errorCode, errorText } from "~/lib/error-text";
import { useHydrated } from "~/lib/hydrated";
import { roleLabel } from "~/lib/labels";
import { m } from "~/paraglide/messages";
import { acceptInviteFn, getInvite } from "~/server/auth/invite-functions";

type InviteState = { kind: "valid"; role: Parameters<typeof roleLabel>[0] } | { kind: "invalid" };

const inviteQuery = (token: string) =>
  queryOptions({
    queryKey: ["invite", token],
    queryFn: async (): Promise<InviteState> => {
      try {
        const r = await getInvite({ data: { token } });
        return r ? { kind: "valid", role: r.role } : { kind: "invalid" };
      } catch {
        // Throttled or malformed: same friendly message as an invalid link.
        return { kind: "invalid" };
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

// Public page (not under _authed): the invitee has no account yet.
export const Route = createFileRoute("/invite/$token")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(inviteQuery(params.token)),
  head: () => ({ meta: [{ title: `${m.invite_title()} · ${m.app_name()}` }] }),
  component: InvitePage,
});

function InvitePage() {
  const params = Route.useParams();
  const invite = useQuery(() => inviteQuery(params().token));
  const [error, setError] = createSignal<string | null>(null);
  const [pending, setPending] = createSignal(false);
  const hydrated = useHydrated();
  const [usedUp, setUsedUp] = createSignal(false);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("password2") ?? "")) {
      setError(m.auth_error_password_mismatch());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await acceptInviteFn({
        data: {
          token: params().token,
          username: String(form.get("username") ?? ""),
          displayName: String(form.get("displayName") ?? ""),
          password,
        },
      });
      // Signed in by the server; full navigation so the root context reloads.
      window.location.assign("/");
    } catch (err) {
      setPending(false);
      if (errorCode(err) === "INVITE_INVALID") setUsedUp(true);
      else setError(errorText(err));
    }
  }

  const valid = () => {
    const d = invite.data;
    return d?.kind === "valid" && !usedUp() ? d : null;
  };

  return (
    <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-4">
      <Card>
        <Switch>
          <Match when={valid()}>
            {(inv) => (
              <>
                <CardHeader>
                  <CardTitle>
                    <h1>{m.invite_title()}</h1>
                  </CardTitle>
                  <p class="text-sm text-muted-foreground">
                    {m.invite_intro({ role: roleLabel(inv().role) })}
                  </p>
                </CardHeader>
                <CardContent>
                  <form class="grid gap-4" onSubmit={onSubmit} method="post">
                    <div class="grid gap-2">
                      <Label for="displayName">{m.auth_display_name()}</Label>
                      <Input
                        id="displayName"
                        name="displayName"
                        autocomplete="name"
                        maxLength={60}
                        required
                      />
                    </div>
                    <div class="grid gap-2">
                      <Label for="username">{m.login_username()}</Label>
                      <Input
                        id="username"
                        name="username"
                        autocomplete="username"
                        autocapitalize="none"
                        spellcheck={false}
                        aria-describedby="username-hint"
                        required
                      />
                      <p id="username-hint" class="text-xs text-muted-foreground">
                        {m.auth_username_hint()}
                      </p>
                    </div>
                    <div class="grid gap-2">
                      <Label for="password">{m.login_password()}</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        autocomplete="new-password"
                        required
                      />
                    </div>
                    <div class="grid gap-2">
                      <Label for="password2">{m.auth_password_repeat()}</Label>
                      <Input
                        id="password2"
                        name="password2"
                        type="password"
                        autocomplete="new-password"
                        required
                      />
                    </div>
                    <Show when={error()}>
                      <p role="alert" class="text-sm text-destructive">
                        {error()}
                      </p>
                    </Show>
                    {/* Disabled until hydrated: an early tap would submit natively. */}
                    <Button
                      type="submit"
                      disabled={pending() || !hydrated()}
                      aria-busy={!hydrated()}
                    >
                      {hydrated() ? m.invite_submit() : m.common_loading()}
                    </Button>
                  </form>
                </CardContent>
              </>
            )}
          </Match>
          <Match when={invite.data && !valid()}>
            <CardHeader>
              <CardTitle>
                <h1>{m.invite_invalid_title()}</h1>
              </CardTitle>
            </CardHeader>
            <CardContent class="grid gap-4">
              <p role="alert">{m.invite_invalid()}</p>
              <Button as={Link} to="/login" variant="outline">
                {m.invite_to_login()}
              </Button>
            </CardContent>
          </Match>
        </Switch>
      </Card>
    </main>
  );
}

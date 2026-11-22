import { createFileRoute, redirect } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/lib/auth-client";
import { useHydrated } from "~/lib/hydrated";
import { m } from "~/paraglide/messages";

/** Only same-site paths, never protocol-relative URLs or the login page itself. */
const safeRedirect = (v: string | undefined) =>
  v?.startsWith("/") && !v.startsWith("//") && !v.startsWith("/login") ? v : "/";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => {
    if (context.user) throw redirect({ href: safeRedirect(search.redirect) });
  },
  head: () => ({ meta: [{ title: `${m.login_title()} · ${m.app_name()}` }] }),
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const [error, setError] = createSignal<string | null>(null);
  const [pending, setPending] = createSignal(false);
  const hydrated = useHydrated();

  // Full navigation so every query and the root context start fresh.
  const done = () => window.location.assign(safeRedirect(search().redirect));

  // A disabled account answers a password sign-in like a wrong password (the
  // server does not confirm guessed passwords); login_failed says to ask an admin.
  const errorText = (status?: number) =>
    status === 429 ? m.login_rate_limited() : m.login_failed();

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.username({
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (error) setError(errorText(error.status));
    else done();
  }

  async function onPasskey() {
    setError(null);
    const res = await authClient.signIn.passkey();
    if (res?.error) {
      const code = "code" in res.error ? res.error.code : undefined;
      setError(code === "ACCOUNT_DISABLED" ? m.login_disabled() : m.login_passkey_failed());
    } else done();
  }

  return (
    <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{m.login_title()}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form class="grid gap-4" onSubmit={onSubmit} method="post">
            <div class="grid gap-2">
              <Label for="username">{m.login_username()}</Label>
              <Input
                id="username"
                name="username"
                autocomplete="username webauthn"
                autocapitalize="none"
                required
              />
            </div>
            <div class="grid gap-2">
              <Label for="password">{m.login_password()}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
              />
            </div>
            <Show when={error()}>
              <p role="alert" class="text-sm text-destructive">
                {error()}
              </p>
            </Show>
            {/* Disabled until hydrated: an early tap or Enter would submit natively. */}
            <Button type="submit" disabled={pending() || !hydrated()} aria-busy={!hydrated()}>
              {hydrated() ? m.login_submit() : m.common_loading()}
            </Button>
          </form>
          <div class="my-4 flex items-center gap-3 text-sm text-muted-foreground">
            <span class="h-px flex-1 bg-border" />
            {m.login_or()}
            <span class="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" class="w-full" onClick={onPasskey} disabled={!hydrated()}>
            {m.login_passkey()}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

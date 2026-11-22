import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { logout } from "~/components/app-shell";
import { ConfirmButton } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { showToast } from "~/components/ui/toast";
import { authClient } from "~/lib/auth-client";
import { formatDate } from "~/lib/format";
import { runAction } from "~/lib/run-action";
import { myPasskeysQuery, sessionQuery } from "~/lib/session-query";
import { m } from "~/paraglide/messages";
import { updateMyDisplayName } from "~/server/auth/functions";

export const Route = createFileRoute("/_authed/account")({
  loader: ({ context }) => context.queryClient.ensureQueryData(myPasskeysQuery()),
  head: () => ({ meta: [{ title: `${m.account_title()} · ${m.app_name()}` }] }),
  component: AccountPage,
});

function AccountPage() {
  return (
    <div class="grid gap-4">
      <h1 class="text-2xl font-semibold">{m.account_title()}</h1>
      <ProfileCard />
      <PasswordCard />
      <PasskeysCard />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{m.account_signout_title()}</h2>
          </CardTitle>
          <CardDescription>{m.account_signout_intro()}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={logout}>
            {m.nav_logout()}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileCard() {
  const ctx = Route.useRouteContext();
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = createSignal(false);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const displayName = String(new FormData(e.currentTarget as HTMLFormElement).get("displayName"));
    setPending(true);
    const ok = await runAction(() => updateMyDisplayName({ data: { displayName } }), {
      success: m.account_display_name_saved(),
    });
    setPending(false);
    if (ok) {
      await qc.invalidateQueries({ queryKey: sessionQuery().queryKey });
      await router.invalidate();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{m.account_profile()}</h2>
        </CardTitle>
        <CardDescription>{m.account_username({ username: ctx().user.username })}</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-3" onSubmit={onSubmit}>
          <div class="grid gap-2">
            <Label for="displayName">{m.auth_display_name()}</Label>
            <Input
              id="displayName"
              name="displayName"
              value={ctx().user.displayName}
              maxLength={60}
              autocomplete="name"
              required
            />
          </div>
          <Button type="submit" class="justify-self-start" disabled={pending()}>
            {m.common_save()}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const ctx = Route.useRouteContext();
  const [error, setError] = createSignal<string | null>(null);
  const [pending, setPending] = createSignal(false);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    const form = new FormData(formEl);
    const newPassword = String(form.get("newPassword") ?? "");
    setError(null);
    if (newPassword !== String(form.get("newPassword2") ?? "")) {
      setError(m.auth_error_password_mismatch());
      return;
    }
    if (newPassword.length === 0) {
      setError(m.auth_error_password_too_short());
      return;
    }
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setError(
        error.code === "INVALID_PASSWORD"
          ? m.account_password_wrong()
          : error.status === 429
            ? m.auth_error_rate_limited()
            : error.code === "PASSWORD_TOO_SHORT"
              ? m.auth_error_password_too_short()
              : m.error_generic(),
      );
      return;
    }
    formEl.reset();
    showToast({ title: m.account_password_changed(), variant: "success" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{m.account_password_title()}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form class="grid gap-3" onSubmit={onSubmit}>
          {/* Lets password managers attach the new password to the right account. */}
          <input
            type="text"
            name="username"
            autocomplete="username"
            value={ctx().user.username}
            hidden
            readOnly
          />
          <div class="grid gap-2">
            <Label for="currentPassword">{m.account_current_password()}</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="newPassword">{m.account_new_password()}</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autocomplete="new-password"
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="newPassword2">{m.auth_password_repeat()}</Label>
            <Input
              id="newPassword2"
              name="newPassword2"
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
          <Button type="submit" class="justify-self-start" disabled={pending()}>
            {m.account_password_submit()}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasskeysCard() {
  const qc = useQueryClient();
  const list = useQuery(() => myPasskeysQuery());
  const [adding, setAdding] = createSignal(false);
  const [renaming, setRenaming] = createSignal<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: myPasskeysQuery().queryKey });

  async function onAdd(e: SubmitEvent) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    const name = String(new FormData(formEl).get("passkeyName") ?? "").trim();
    setAdding(true);
    const res = await authClient.passkey.addPasskey({ name: name || undefined });
    setAdding(false);
    if (res?.error) {
      showToast({ title: m.account_passkey_add_failed(), variant: "error" });
      return;
    }
    formEl.reset();
    showToast({ title: m.account_passkey_added(), variant: "success" });
    await refresh();
  }

  async function onRename(e: SubmitEvent, id: string) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget as HTMLFormElement).get("name") ?? "").trim();
    if (!name) return;
    const { error } = await authClient.passkey.updatePasskey({ id, name });
    if (error) showToast({ title: m.error_generic(), variant: "error" });
    else {
      showToast({ title: m.account_passkey_renamed(), variant: "success" });
      setRenaming(null);
      await refresh();
    }
  }

  async function onDelete(id: string) {
    const { error } = await authClient.passkey.deletePasskey({ id });
    if (error) showToast({ title: m.error_generic(), variant: "error" });
    else {
      showToast({ title: m.account_passkey_deleted(), variant: "success" });
      await refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{m.account_passkeys_title()}</h2>
        </CardTitle>
        <CardDescription>{m.account_passkeys_intro()}</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <Show
          when={(list.data ?? []).length > 0}
          fallback={<p class="text-sm text-muted-foreground">{m.account_passkeys_empty()}</p>}
        >
          <ul class="grid gap-2" aria-label={m.account_passkeys_title()}>
            <For each={list.data}>
              {(pk) => {
                const label = () => pk.name || m.account_passkey_unnamed();
                return (
                  <li class="grid gap-2 rounded-md border p-3">
                    <Show
                      when={renaming() === pk.id}
                      fallback={
                        <div class="flex flex-wrap items-center gap-2">
                          <div class="mr-auto">
                            <p class="font-medium">{label()}</p>
                            <Show when={pk.createdAt}>
                              {(d) => (
                                <p class="text-xs text-muted-foreground">
                                  {m.account_passkey_created({ date: formatDate(d()) })}
                                </p>
                              )}
                            </Show>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setRenaming(pk.id)}>
                            {m.account_passkey_rename()}
                          </Button>
                          <ConfirmButton
                            label={m.account_passkey_delete()}
                            question={m.account_passkey_delete_confirm({ name: label() })}
                            destructive
                            onConfirm={() => onDelete(pk.id)}
                          />
                        </div>
                      }
                    >
                      <form class="flex flex-wrap gap-2" onSubmit={(e) => onRename(e, pk.id)}>
                        <Input
                          name="name"
                          value={pk.name ?? ""}
                          aria-label={m.account_passkey_name()}
                          maxLength={60}
                          class="flex-1"
                          required
                        />
                        <Button type="submit" size="sm">
                          {m.common_save()}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setRenaming(null)}>
                          {m.common_cancel()}
                        </Button>
                      </form>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
        <form class="grid gap-2" onSubmit={onAdd}>
          <Label for="passkeyName">{m.account_passkey_name()}</Label>
          <div class="flex flex-wrap gap-2">
            <Input
              id="passkeyName"
              name="passkeyName"
              placeholder={m.account_passkey_name_placeholder()}
              maxLength={60}
              class="flex-1"
            />
            <Button type="submit" disabled={adding()}>
              {m.account_passkey_add()}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

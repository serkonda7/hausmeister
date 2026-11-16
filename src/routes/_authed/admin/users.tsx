import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { ConfirmButton } from "~/components/confirm-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input, inputClass } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { adminUsersQuery } from "~/lib/admin-queries";
import { guardSection } from "~/lib/admin-sections";
import { cn } from "~/lib/cn";
import { formatDate } from "~/lib/format";
import { roleLabel } from "~/lib/labels";
import { runAction } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import {
  adminChangeRole,
  adminResetPassword,
  adminSetUserDisabled,
} from "~/server/admin/functions";
import type { AdminUserRow } from "~/server/admin/users";
import type { Role } from "~/server/authz/ctx";

const ROLES: Role[] = ["admin", "member", "guest"];

export const Route = createFileRoute("/_authed/admin/users")({
  beforeLoad: ({ context }) => guardSection(context.user.role, "/admin/users"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminUsersQuery()),
  head: () => ({ meta: [{ title: `${m.admin_nav_users()} · ${m.app_name()}` }] }),
  component: UsersPage,
});

function UsersPage() {
  const ctx = Route.useRouteContext();
  const qc = useQueryClient();
  const users = useQuery(() => adminUsersQuery());
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const [resetFor, setResetFor] = createSignal<AdminUserRow | null>(null);

  async function changeRole(u: AdminUserRow, role: Role, select: HTMLSelectElement) {
    const ok = await runAction(
      async () => {
        await adminChangeRole({ data: { userId: u.id, role } });
        return true;
      },
      { success: m.admin_users_role_changed({ name: u.displayName }) },
    );
    if (!ok) select.value = u.role; // refused: show the real role again
    await refresh();
  }

  async function setDisabled(u: AdminUserRow, disabled: boolean) {
    await runAction(() => adminSetUserDisabled({ data: { userId: u.id, disabled } }), {
      success: disabled
        ? m.admin_users_disabled({ name: u.displayName })
        : m.admin_users_enabled({ name: u.displayName }),
    });
    await refresh();
  }

  return (
    <div class="grid gap-3">
      <p class="text-sm text-muted-foreground">{m.admin_users_intro()}</p>
      <ul class="grid gap-3" aria-label={m.admin_nav_users()}>
        <For each={users.data}>
          {(u) => {
            const self = () => u.id === ctx().user.id;
            return (
              <li>
                <Card aria-label={u.displayName}>
                  <CardContent class="grid gap-3 pt-4">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-semibold">{u.displayName}</span>
                      <span class="text-sm text-muted-foreground">@{u.username}</span>
                      <Show when={self()}>
                        <Badge variant="outline">{m.admin_users_you()}</Badge>
                      </Show>
                      <Badge variant={u.disabled ? "destructive" : "secondary"}>
                        {u.disabled ? m.admin_users_disabled_badge() : m.admin_users_active()}
                      </Badge>
                    </div>
                    <div class="grid gap-1 text-sm text-muted-foreground">
                      <span>
                        {u.lastActiveAt
                          ? m.admin_users_last_active({ date: formatDate(u.lastActiveAt) })
                          : m.admin_users_no_session()}
                      </span>
                      <Show when={u.groups.length > 0}>
                        <span>{m.admin_users_groups({ groups: u.groups.join(", ") })}</span>
                      </Show>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <select
                        class={cn(inputClass, "h-9 w-auto")}
                        aria-label={m.admin_users_role_label({ name: u.displayName })}
                        value={u.role}
                        onChange={(e) =>
                          changeRole(u, e.currentTarget.value as Role, e.currentTarget)
                        }
                      >
                        <For each={ROLES}>
                          {(r) => (
                            <option value={r} selected={r === u.role}>
                              {roleLabel(r)}
                            </option>
                          )}
                        </For>
                      </select>
                      <Button variant="outline" size="sm" onClick={() => setResetFor(u)}>
                        {m.admin_users_reset_password()}
                      </Button>
                      <Show
                        when={u.disabled}
                        fallback={
                          <Show when={!self()}>
                            <ConfirmButton
                              label={m.admin_users_disable()}
                              question={m.admin_users_disable_confirm({ name: u.displayName })}
                              destructive
                              onConfirm={() => setDisabled(u, true)}
                            />
                          </Show>
                        }
                      >
                        <Button variant="outline" size="sm" onClick={() => setDisabled(u, false)}>
                          {m.admin_users_enable()}
                        </Button>
                      </Show>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          }}
        </For>
      </ul>
      <ResetPasswordDialog user={resetFor()} onClose={() => setResetFor(null)} />
    </div>
  );
}

function ResetPasswordDialog(props: { user: AdminUserRow | null; onClose: () => void }) {
  const [pending, setPending] = createSignal(false);
  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const u = props.user;
    if (!u) return;
    const password = String(new FormData(e.currentTarget as HTMLFormElement).get("password"));
    setPending(true);
    const ok = await runAction(
      async () => {
        await adminResetPassword({ data: { userId: u.id, password } });
        return true;
      },
      { success: m.admin_users_reset_done({ name: u.displayName }) },
    );
    setPending(false);
    if (ok) props.onClose();
  }
  return (
    <Dialog open={props.user !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <form class="grid gap-4" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {m.admin_users_reset_title({ name: props.user?.displayName ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {m.admin_users_reset_hint({ name: props.user?.displayName ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div class="grid gap-2">
            <Label for="reset-password">{m.account_new_password()}</Label>
            <Input
              id="reset-password"
              name="password"
              type="text"
              autocomplete="off"
              minLength={10}
              aria-describedby="reset-password-hint"
              required
            />
            <p id="reset-password-hint" class="text-xs text-muted-foreground">
              {m.auth_password_hint()}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={props.onClose}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" disabled={pending()}>
              {m.admin_users_reset_password()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

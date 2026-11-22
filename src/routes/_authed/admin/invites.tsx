import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { ConfirmButton } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input, inputClass } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { showToast } from "~/components/ui/toast";
import { adminInvitesQuery } from "~/lib/admin-queries";
import { guardSection } from "~/lib/admin-sections";
import { formatDateTime } from "~/lib/format";
import { roleLabel } from "~/lib/labels";
import { runAction } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import { adminCreateInvite, adminRevokeInvite } from "~/server/admin/functions";
import type { Role } from "~/server/authz/ctx";

const EXPIRY_DAYS = [1, 3, 7, 14, 30];

export const Route = createFileRoute("/_authed/admin/invites")({
  beforeLoad: ({ context }) => guardSection(context.user.role, "/admin/invites"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminInvitesQuery()),
  head: () => ({ meta: [{ title: `${m.admin_nav_invites()} · ${m.app_name()}` }] }),
  component: InvitesPage,
});

function InvitesPage() {
  const qc = useQueryClient();
  const pending = useQuery(() => adminInvitesQuery());
  const [link, setLink] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const refresh = () => qc.invalidateQueries({ queryKey: adminInvitesQuery().queryKey });

  async function onCreate(e: SubmitEvent) {
    e.preventDefault();
    const form = new FormData(e.currentTarget as HTMLFormElement);
    setBusy(true);
    const r = await runAction(() =>
      adminCreateInvite({
        data: {
          role: String(form.get("role")) as Role,
          expiresInDays: Number(form.get("days")),
        },
      }),
    );
    setBusy(false);
    if (r) {
      setLink(r.url);
      await refresh();
    }
  }

  async function copy() {
    const l = link();
    if (!l) return;
    try {
      await navigator.clipboard.writeText(l);
      showToast({ title: m.invite_copied(), variant: "success" });
    } catch {
      // Clipboard blocked (e.g. plain http): the field is selectable instead.
      document.getElementById("invite-link")?.focus();
    }
  }

  return (
    <div class="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{m.invite_create()}</h2>
          </CardTitle>
          <CardDescription>{m.invite_admin_intro()}</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-4">
          <form class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={onCreate}>
            <div class="grid gap-2">
              <Label for="invite-role">{m.invite_role()}</Label>
              <select id="invite-role" name="role" class={inputClass}>
                <option value="member" selected>
                  {roleLabel("member")}
                </option>
                <option value="guest">{roleLabel("guest")}</option>
                <option value="admin">{roleLabel("admin")}</option>
              </select>
            </div>
            <div class="grid gap-2">
              <Label for="invite-days">{m.invite_expiry()}</Label>
              <select id="invite-days" name="days" class={inputClass}>
                <For each={EXPIRY_DAYS}>
                  {(d) => (
                    <option value={d} selected={d === 7}>
                      {d === 1 ? m.invite_expiry_one() : m.invite_expiry_days({ days: d })}
                    </option>
                  )}
                </For>
              </select>
            </div>
            <Button type="submit" disabled={busy()}>
              {m.invite_create()}
            </Button>
          </form>
          <Show when={link()}>
            {(l) => (
              <div class="grid gap-2 rounded-md border border-primary/40 bg-accent/40 p-3">
                <Label for="invite-link">{m.invite_link_label()}</Label>
                <p class="text-sm">{m.invite_created_once()}</p>
                <Input
                  id="invite-link"
                  value={l()}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  class="font-mono text-sm"
                />
                <Button variant="outline" class="justify-self-start" onClick={copy}>
                  {m.invite_copy()}
                </Button>
              </div>
            )}
          </Show>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{m.invite_pending_title()}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Show
            when={(pending.data ?? []).length > 0}
            fallback={<p class="text-sm text-muted-foreground">{m.invite_pending_empty()}</p>}
          >
            <ul class="grid gap-2" aria-label={m.invite_pending_title()}>
              <For each={pending.data}>
                {(inv) => (
                  <li class="flex flex-wrap items-center gap-2 rounded-md border p-3">
                    <div class="mr-auto grid gap-0.5">
                      <span class="font-medium">{roleLabel(inv.role)}</span>
                      <span class="text-xs text-muted-foreground">
                        {m.invite_pending_until({ date: formatDateTime(inv.expiresAt) })} ·{" "}
                        {inv.createdByName
                          ? m.invite_created_by({ name: inv.createdByName })
                          : m.invite_created_by_system()}
                      </span>
                    </div>
                    <ConfirmButton
                      label={m.invite_revoke()}
                      question={m.invite_revoke_confirm()}
                      destructive
                      onConfirm={async () => {
                        await runAction(() => adminRevokeInvite({ data: { inviteId: inv.id } }), {
                          success: m.invite_revoked(),
                        });
                        await refresh();
                      }}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </CardContent>
      </Card>
    </div>
  );
}

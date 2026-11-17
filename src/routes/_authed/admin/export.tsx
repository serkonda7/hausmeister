import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { formatBytes } from "~/components/attachments/format";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { showToast } from "~/components/ui/toast";
import { guardSection } from "~/lib/admin-sections";
import { errorCode } from "~/lib/error-text";
import { exportInfoQuery } from "~/lib/export/queries";
import { EXPORT_URL, type ExportPhase } from "~/lib/export/types";
import { formatDateTime, formatNumber } from "~/lib/format";
import { runAction } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import { reserveExportFn } from "~/server/export/functions";

export const Route = createFileRoute("/_authed/admin/export")({
  beforeLoad: ({ context }) => guardSection(context.user.role, "/admin/export"),
  loader: ({ context }) => context.queryClient.ensureQueryData(exportInfoQuery()),
  head: () => ({ meta: [{ title: `${m.admin_nav_export()} · ${m.app_name()}` }] }),
  component: ExportPage,
});

const ERRORS: Record<string, () => string> = {
  EXPORT_BUSY: m.export_error_busy,
  EXPORT_LIMIT: m.export_error_limit,
  EXPORT_TICKET_INVALID: m.export_error_ticket,
};

const PHASE: Record<ExportPhase, () => string> = {
  data: m.export_phase_data,
  files: m.export_phase_files,
  tables: m.export_phase_tables,
  finishing: m.export_phase_finishing,
};

function ExportPage() {
  const qc = useQueryClient();
  // Set between the click and the server reporting the running export.
  const [starting, setStarting] = createSignal(false);
  const info = useQuery(() => ({
    ...exportInfoQuery(),
    refetchInterval: (q: { state: { data?: { active: unknown } } }) =>
      starting() || q.state.data?.active ? 1000 : false,
  }));
  const active = () => info.data?.active ?? null;
  const busy = () => starting() || !!active();

  async function onDownload() {
    const clickedAt = Date.now();
    setStarting(true);
    const r = await runAction(() => reserveExportFn(), {
      onError: (err) => {
        const text = ERRORS[errorCode(err) ?? ""];
        if (!text) return false;
        showToast({ title: text(), variant: "error" });
        return true;
      },
    });
    if (!r) {
      setStarting(false);
      return;
    }
    // An attachment response: the browser downloads it and the page stays.
    window.location.assign(`${EXPORT_URL}?ticket=${encodeURIComponent(r.ticket)}`);
    // "wird gestartet" until the server reports the export as running or
    // finished (a small one can finish between two polls), or a minute passed.
    const until = clickedAt + 60_000;
    const poll = async () => {
      const d = await qc.fetchQuery({ ...exportInfoQuery(), staleTime: 0 });
      const finished = d.last && new Date(d.last.finishedAt).getTime() >= clickedAt;
      if (d.active || finished || Date.now() > until) setStarting(false);
      else setTimeout(poll, 700);
    };
    setTimeout(poll, 500);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{m.export_title()}</h2>
        </CardTitle>
        <CardDescription>{m.export_intro()}</CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <Show when={info.data}>
          {(d) => (
            <>
              <p class="text-sm">
                {d().scope === "all" ? m.export_scope_all() : m.export_scope_member()}
              </p>
              <p class="text-sm text-muted-foreground">
                {m.export_estimate({
                  items: formatNumber(d().estimate.items, 0),
                  files: formatNumber(d().estimate.attachments, 0),
                  size: formatBytes(d().estimate.fileBytes),
                })}{" "}
                {m.export_no_secrets()}
              </p>
            </>
          )}
        </Show>
        <div>
          <Button onClick={onDownload} disabled={busy()} aria-busy={busy()}>
            {busy() ? m.export_running() : m.export_download()}
          </Button>
        </div>
        <div role="status" aria-live="polite" class="grid gap-1 text-sm">
          <Show when={active()}>
            {(p) => (
              <>
                <p class="font-medium">
                  {m.export_running()} ({PHASE[p().phase]()})
                </p>
                <p>
                  {m.export_progress({
                    written: formatBytes(p().bytesWritten),
                    done: formatNumber(p().filesDone, 0),
                    total: formatNumber(p().filesTotal, 0),
                  })}
                </p>
                <p class="text-muted-foreground">{m.export_running_hint()}</p>
              </>
            )}
          </Show>
          <Show when={starting() && !active()}>
            <p class="font-medium">{m.export_starting()}</p>
          </Show>
          <Show when={!busy() && info.data?.last}>
            {(l) => (
              <p class="text-muted-foreground">
                {l().completed
                  ? m.export_last_done({
                      date: formatDateTime(l().finishedAt),
                      size: formatBytes(l().bytes),
                    })
                  : m.export_last_aborted({ date: formatDateTime(l().finishedAt) })}
              </p>
            )}
          </Show>
        </div>
      </CardContent>
    </Card>
  );
}

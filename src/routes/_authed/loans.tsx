// Loans overview (DESIGN §9 "my loans, due back, pending requests"): what the
// caller borrows, requests waiting for them, and what they lent out
// (overdue first). Contacts for external borrowers are one click away.
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { For, type JSX, Show } from "solid-js";
import { LoanListCard } from "~/components/loans/loan-actions";
import { loanOverviewQuery } from "~/lib/loans/queries";
import type { LoanListRow } from "~/lib/loans/types";
import { actionErrorText } from "~/lib/run-action";
import { m } from "~/paraglide/messages";

export const Route = createFileRoute("/_authed/loans")({
  loader: ({ context }) => context.queryClient.ensureQueryData(loanOverviewQuery()),
  head: () => ({ meta: [{ title: `${m.loans_title()} · ${m.app_name()}` }] }),
  component: LoansPage,
});

function LoanGroup(props: { id: string; title: string; rows: LoanListRow[]; empty?: JSX.Element }) {
  return (
    <Show when={props.rows.length || props.empty}>
      <section class="grid gap-3" aria-labelledby={props.id}>
        <h2 id={props.id} class="text-lg font-semibold">
          {props.title}
        </h2>
        <Show when={props.rows.length} fallback={props.empty}>
          <ul class="grid gap-2">
            <For each={props.rows}>{(l) => <LoanListCard loan={l} />}</For>
          </ul>
        </Show>
      </section>
    </Show>
  );
}

function LoansPage() {
  const ctx = Route.useRouteContext();
  const q = useQuery(() => loanOverviewQuery());
  const empty = () =>
    !!q.data && !q.data.mine.length && !q.data.requests.length && !q.data.lentOut.length;
  return (
    <div class="grid gap-6">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="mr-auto text-2xl font-semibold">{m.loans_title()}</h1>
        <Show when={ctx().user.role !== "guest"}>
          <Link to="/contacts" class="text-sm text-primary underline-offset-4 hover:underline">
            {m.contacts_title()}
          </Link>
        </Show>
      </div>
      <Show when={q.isError}>
        <p role="alert" class="text-sm text-destructive">
          {actionErrorText(q.error)}
        </p>
      </Show>
      <Show when={empty()}>
        <p class="text-muted-foreground">{m.loans_empty()}</p>
      </Show>
      <Show when={q.data}>
        {(d) => (
          <>
            <LoanGroup id="loans-requests" title={m.loans_group_requests()} rows={d().requests} />
            <LoanGroup id="loans-lent" title={m.loans_group_lent_out()} rows={d().lentOut} />
            <LoanGroup id="loans-mine" title={m.loans_group_mine()} rows={d().mine} />
          </>
        )}
      </Show>
    </div>
  );
}

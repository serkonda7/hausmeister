// External contacts (admins and members): people without an account who borrow things.
// Name is enough; e-mail and phone help remind them (email reminders come with v1.2).
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { ConfirmButton } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { inputClass } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useHydrated } from "~/lib/hydrated";
import type { ContactInput } from "~/lib/loans/inputs";
import { contactsQuery } from "~/lib/loans/queries";
import type { ContactRow } from "~/lib/loans/types";
import { runAction } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import { createContactFn, deleteContactFn, updateContactFn } from "~/server/contacts/functions";

export const Route = createFileRoute("/_authed/contacts")({
  beforeLoad: ({ context }) => {
    if (context.user.role === "guest") throw notFound();
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(contactsQuery()),
  head: () => ({ meta: [{ title: `${m.contacts_title()} · ${m.app_name()}` }] }),
  component: ContactsPage,
});

type Values = { name: string; email: string; phone: string; notes: string };
const empty = (): Values => ({ name: "", email: "", phone: "", notes: "" });
const toInput = (v: Values): ContactInput => ({
  name: v.name.trim(),
  email: v.email.trim() || null,
  phone: v.phone.trim() || null,
  notes: v.notes.trim() || null,
});

function ContactFields(props: {
  prefix: string;
  values: Values;
  set: (k: keyof Values, v: string) => void;
  error?: string;
}) {
  const field = (k: Exclude<keyof Values, "notes">, label: string, type = "text") => (
    <div class="grid gap-2">
      <label for={`${props.prefix}-${k}`} class="text-sm font-medium">
        {label}
      </label>
      <input
        id={`${props.prefix}-${k}`}
        type={type}
        class={inputClass}
        autocomplete="off"
        value={props.values[k]}
        aria-invalid={k === "name" && props.error ? true : undefined}
        aria-describedby={k === "name" && props.error ? `${props.prefix}-error` : undefined}
        onInput={(e) => props.set(k, e.currentTarget.value)}
      />
    </div>
  );
  return (
    <div class="grid gap-3">
      {field("name", m.contacts_field_name())}
      <Show when={props.error}>
        <p id={`${props.prefix}-error`} class="text-sm text-destructive">
          {props.error}
        </p>
      </Show>
      <div class="grid gap-3 sm:grid-cols-2">
        {field("email", m.contacts_field_email(), "email")}
        {field("phone", m.contacts_field_phone(), "tel")}
      </div>
      <div class="grid gap-2">
        <label for={`${props.prefix}-notes`} class="text-sm font-medium">
          {m.contacts_field_notes()}
        </label>
        <Textarea
          id={`${props.prefix}-notes`}
          rows={2}
          value={props.values.notes}
          onInput={(e) => props.set("notes", e.currentTarget.value)}
        />
      </div>
    </div>
  );
}

function ContactsPage() {
  const qc = useQueryClient();
  const q = useQuery(() => contactsQuery());
  const hydrated = useHydrated();
  const [values, setValues] = createSignal(empty());
  const [error, setError] = createSignal<string>();
  const refresh = () => qc.invalidateQueries({ queryKey: ["contacts"] });

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!values().name.trim()) {
      setError(m.contacts_error_name());
      document.getElementById("new-contact-name")?.focus();
      return;
    }
    setError(undefined);
    const r = await runAction(() => createContactFn({ data: toInput(values()) }), {
      success: m.contacts_added({ name: values().name.trim() }),
    });
    if (!r) return;
    setValues(empty());
    await refresh();
  }

  return (
    <div class="grid gap-6">
      <div class="grid gap-1">
        <h1 class="text-2xl font-semibold">{m.contacts_title()}</h1>
        <p class="text-sm text-muted-foreground">{m.contacts_intro()}</p>
      </div>
      <form class="grid gap-3 rounded-lg border bg-card p-4" noValidate onSubmit={add}>
        <h2 class="text-lg font-semibold">{m.contacts_add()}</h2>
        <ContactFields
          prefix="new-contact"
          values={values()}
          set={(k, v) => setValues((x) => ({ ...x, [k]: v }))}
          error={error()}
        />
        <div>
          <Button type="submit" disabled={!hydrated()}>
            {hydrated() ? m.contacts_add() : m.common_loading()}
          </Button>
        </div>
      </form>
      <Show
        when={(q.data ?? []).length}
        fallback={<p class="text-muted-foreground">{m.contacts_empty()}</p>}
      >
        <ul class="grid gap-2" aria-label={m.contacts_title()}>
          <For each={q.data}>{(c) => <ContactItem contact={c} onChange={refresh} />}</For>
        </ul>
      </Show>
    </div>
  );
}

function ContactItem(props: { contact: ContactRow; onChange: () => unknown }) {
  const [open, setOpen] = createSignal(false);
  const [values, setValues] = createSignal(empty());
  const [error, setError] = createSignal<string>();
  const c = () => props.contact;
  async function save() {
    if (!values().name.trim()) return setError(m.contacts_error_name());
    const r = await runAction(
      () => updateContactFn({ data: { id: c().id, ...toInput(values()) } }),
      { success: m.contacts_saved() },
    );
    if (!r) return;
    setOpen(false);
    await props.onChange();
  }
  return (
    <li class="grid gap-1 rounded-lg border bg-card p-3" data-testid="contact">
      <div class="flex flex-wrap items-center gap-2">
        <p class="min-w-0 flex-1 break-words font-medium">{c().name}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setValues({
              name: c().name,
              email: c().email ?? "",
              phone: c().phone ?? "",
              notes: c().notes ?? "",
            });
            setError(undefined);
            setOpen(true);
          }}
        >
          {m.contacts_edit()}
        </Button>
        <ConfirmButton
          label={m.contacts_delete()}
          question={m.contacts_delete_question({ name: c().name })}
          destructive
          onConfirm={async () => {
            const r = await runAction(() => deleteContactFn({ data: { id: c().id } }), {
              success: m.contacts_deleted({ name: c().name }),
            });
            if (r) await props.onChange();
          }}
        />
      </div>
      <p class="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
        <Show when={c().email}>
          <a href={`mailto:${c().email}`} class="underline-offset-4 hover:underline">
            {c().email}
          </a>
        </Show>
        <Show when={c().phone}>
          <a href={`tel:${c().phone}`} class="underline-offset-4 hover:underline">
            {c().phone}
          </a>
        </Show>
        <Show when={c().openLoans > 0}>
          <span>{m.contacts_open_loans({ count: c().openLoans })}</span>
        </Show>
      </p>
      <Show when={c().notes}>
        <p class="whitespace-pre-line break-words text-sm">{c().notes}</p>
      </Show>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.contacts_edit_title({ name: c().name })}</DialogTitle>
          </DialogHeader>
          <ContactFields
            prefix={`contact-${c().id}`}
            values={values()}
            set={(k, v) => setValues((x) => ({ ...x, [k]: v }))}
            error={error()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m.common_cancel()}
            </Button>
            <Button onClick={save}>{m.common_save()}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

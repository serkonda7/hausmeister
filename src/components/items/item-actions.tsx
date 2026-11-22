// Actions on the item page, each shown only at the level that allows it
// (ItemDetail.permissions): move and status (use), change type (edit), owner,
// visibility and delete (manage). Every write sends the version it read; on
// VERSION_CONFLICT the item is reloaded and the user told.
import { createForm } from "@tanstack/solid-form";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { ConfirmButton } from "~/components/confirm-dialog";
import { AttributeFields } from "~/components/item-types/attribute-fields";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { inputClass } from "~/components/ui/input";
import { typeIconGlyph } from "~/lib/item-types/icons";
import { itemTypeQuery, itemTypesQuery } from "~/lib/item-types/queries";
import { flattenTree } from "~/lib/item-types/tree";
import { ITEM_STATUSES, type ItemStatus, isGoneStatus } from "~/lib/items/constants";
import { parseItemsError } from "~/lib/items/errors";
import { statusLabel } from "~/lib/items/labels";
import type { ItemDetail, TypeChangeResult } from "~/lib/items/types";
import { runAction } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import type { SessionUser } from "~/server/auth/functions";
import {
  changeItemOwnerFn,
  changeItemTypeFn,
  deleteItemFn,
  moveItemFn,
  setItemStatusFn,
  setItemVisibilityFn,
} from "~/server/items/functions";
import { applyAttributeErrors } from "./item-form";
import { LocationPicker, type Placement, placementInput } from "./location-picker";
import { OwnerSelect, type OwnerValue } from "./owner-picker";
import { useItemWrite } from "./use-item-write";
import { VisibilityChoice } from "./visibility-choice";

function ActionDialog(props: {
  label: string;
  title?: string;
  description?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: JSX.Element;
  footer: JSX.Element;
  variant?: "outline" | "secondary" | "default";
}) {
  return (
    <>
      <Button variant={props.variant ?? "outline"} onClick={() => props.onOpenChange(true)}>
        {props.label}
      </Button>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{props.title ?? props.label}</DialogTitle>
            <Show when={props.description}>
              <DialogDescription>{props.description}</DialogDescription>
            </Show>
          </DialogHeader>
          {props.children}
          <DialogFooter>{props.footer}</DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const lastContainerName = (d: ItemDetail) => {
  const c = [...d.path].reverse().find((p) => p.kind === "item");
  return c && c.kind === "item" ? c.name : undefined;
};

export function MoveAction(props: { detail: ItemDetail }) {
  const write = useItemWrite();
  const [open, setOpen] = createSignal(false);
  const initial = (): Placement => ({
    locationId: props.detail.item.locationId,
    containerItemId: props.detail.item.containerItemId,
  });
  const [place, setPlace] = createSignal<Placement>(initial());
  const [busy, setBusy] = createSignal(false);
  async function submit() {
    setBusy(true);
    const it = props.detail.item;
    const r = await write(
      () => moveItemFn({ data: { id: it.id, version: it.version, ...placementInput(place()) } }),
      { success: m.item_moved() },
    );
    setBusy(false);
    if (r) setOpen(false);
  }
  return (
    <ActionDialog
      label={m.item_action_move()}
      open={open()}
      onOpenChange={(o) => {
        if (o) setPlace(initial());
        setOpen(o);
      }}
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {m.common_cancel()}
          </Button>
          <Button disabled={busy() || place().containerItemId === ""} onClick={submit}>
            {m.item_action_move_confirm()}
          </Button>
        </>
      }
    >
      <LocationPicker
        id="move-place"
        value={place()}
        onChange={setPlace}
        excludeItemId={props.detail.item.id}
        containerName={lastContainerName(props.detail)}
      />
    </ActionDialog>
  );
}

export function StatusAction(props: { detail: ItemDetail }) {
  const write = useItemWrite();
  const [open, setOpen] = createSignal(false);
  const [status, setStatus] = createSignal<ItemStatus>(props.detail.item.status);
  const allowed = (s: ItemStatus) =>
    props.detail.permissions.canManage ||
    (!isGoneStatus(s) && !isGoneStatus(props.detail.item.status));
  async function submit() {
    const it = props.detail.item;
    const r = await write(
      () => setItemStatusFn({ data: { id: it.id, version: it.version, status: status() } }),
      { success: m.item_status_changed({ status: statusLabel(status()) }) },
    );
    if (r) setOpen(false);
  }
  return (
    <ActionDialog
      label={m.item_action_status()}
      open={open()}
      onOpenChange={(o) => {
        if (o) setStatus(props.detail.item.status);
        setOpen(o);
      }}
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {m.common_cancel()}
          </Button>
          <Button disabled={status() === props.detail.item.status} onClick={submit}>
            {m.common_save()}
          </Button>
        </>
      }
    >
      <fieldset class="grid gap-1">
        <legend class="sr-only">{m.item_field_status()}</legend>
        <For each={ITEM_STATUSES}>
          {(s) => (
            <label class="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="item-status"
                class="size-4 accent-primary"
                checked={status() === s}
                disabled={!allowed(s)}
                onChange={() => setStatus(s)}
              />
              <span class={allowed(s) ? "" : "text-muted-foreground"}>{statusLabel(s)}</span>
              <Show when={isGoneStatus(s)}>
                <span class="text-xs text-muted-foreground">· {m.item_status_gone_hint()}</span>
              </Show>
            </label>
          )}
        </For>
      </fieldset>
      <Show when={!props.detail.permissions.canManage}>
        <p class="text-sm text-muted-foreground">{m.item_status_manage_hint()}</p>
      </Show>
    </ActionDialog>
  );
}

export function TypeAction(props: { detail: ItemDetail }) {
  const write = useItemWrite();
  const types = useQuery(() => itemTypesQuery(false));
  const [open, setOpen] = createSignal(false);
  const [to, setTo] = createSignal("");
  const [preview, setPreview] = createSignal<Extract<TypeChangeResult, { status: "preview" }>>();
  const [busy, setBusy] = createSignal(false);
  const target = useQuery(() => ({ ...itemTypeQuery(to()), enabled: !!to() }));
  const options = createMemo(() =>
    flattenTree(types.data ?? []).filter((t) => t.id !== props.detail.type.id),
  );
  const form = createForm(() => ({
    defaultValues: { attributes: {} as Record<string, unknown> },
    onSubmit: ({ value }) => confirm(value.attributes),
  }));
  const oldLabel = (k: string) =>
    props.detail.type.effectiveFields.find((f) => f.key === k)?.label ?? k;
  const newLabel = (k: string) => target.data?.effectiveFields.find((f) => f.key === k)?.label ?? k;
  const missingFields = createMemo(() =>
    (target.data?.effectiveFields ?? []).filter((f) =>
      preview()?.plan.missingRequired.includes(f.key),
    ),
  );

  function reset() {
    setTo("");
    setPreview(undefined);
    form.reset();
  }

  async function loadPreview() {
    const it = props.detail.item;
    setBusy(true);
    const r = await write(() =>
      changeItemTypeFn({ data: { id: it.id, version: it.version, typeId: to() } }),
    );
    setBusy(false);
    if (r?.status === "preview") setPreview(r);
  }

  async function confirm(values: Record<string, unknown>) {
    const it = props.detail.item;
    const extra = Object.fromEntries(
      Object.entries(values).filter(([k]) => preview()?.plan.missingRequired.includes(k)),
    );
    setBusy(true);
    const r = await write(
      () =>
        changeItemTypeFn({
          data: { id: it.id, version: it.version, typeId: to(), confirm: true, attributes: extra },
        }),
      {
        success: m.item_type_changed({ type: target.data?.name ?? "" }),
        onError: (err) => {
          const p = parseItemsError(err);
          if (p.code === "ATTRIBUTES_INVALID")
            applyAttributeErrors(form, p.fieldErrors, { idPrefix: "type-attr" });
          if (p.code === "VERSION_CONFLICT") setPreview(undefined);
          return false;
        },
      },
    );
    setBusy(false);
    if (r?.status === "saved") {
      setOpen(false);
      reset();
    }
  }

  const List = (p: {
    title: string;
    keys: string[];
    label: (k: string) => string;
    testId: string;
  }) => (
    <Show when={p.keys.length}>
      <div class="grid gap-1" data-testid={p.testId}>
        <h3 class="text-sm font-medium">{p.title}</h3>
        <ul class="list-disc pl-5 text-sm">
          <For each={p.keys}>{(k) => <li>{p.label(k)}</li>}</For>
        </ul>
      </div>
    </Show>
  );

  return (
    <ActionDialog
      label={m.item_action_type()}
      description={m.item_type_change_intro()}
      open={open()}
      onOpenChange={(o) => {
        if (!o) reset();
        setOpen(o);
      }}
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {m.common_cancel()}
          </Button>
          <Show
            when={preview()}
            fallback={
              <Button disabled={!to() || busy()} onClick={loadPreview}>
                {m.item_type_preview()}
              </Button>
            }
          >
            <Button disabled={busy()} onClick={() => void form.handleSubmit()}>
              {m.item_type_confirm()}
            </Button>
          </Show>
        </>
      }
    >
      <div class="grid gap-2">
        <label for="type-change-to" class="text-sm font-medium">
          {m.item_type_new()}
        </label>
        <select
          id="type-change-to"
          class={inputClass}
          value={to()}
          onChange={(e) => {
            setTo(e.currentTarget.value);
            setPreview(undefined);
          }}
        >
          <option value="" selected={!to()}>
            {m.item_type_pick()}
          </option>
          <For each={options()}>
            {(t) => (
              <option value={t.id} selected={t.id === to()}>
                {"  ".repeat(t.depth)}
                {typeIconGlyph(t.icon)} {t.name}
              </option>
            )}
          </For>
        </select>
      </div>
      <Show when={preview()}>
        {(p) => (
          <div
            class="grid gap-3 rounded-md border bg-muted/40 p-3"
            data-testid="type-preview"
            aria-live="polite"
          >
            <p class="text-sm">{m.item_type_preview_intro({ type: target.data?.name ?? "" })}</p>
            <List
              title={m.item_type_kept()}
              keys={p().plan.kept}
              label={newLabel}
              testId="plan-kept"
            />
            <List
              title={m.item_type_converted()}
              keys={p().plan.converted}
              label={newLabel}
              testId="plan-converted"
            />
            <List
              title={m.item_type_legacy()}
              keys={p().plan.legacy}
              label={oldLabel}
              testId="plan-legacy"
            />
            <List
              title={m.item_type_removed()}
              keys={p().plan.removed}
              label={oldLabel}
              testId="plan-removed"
            />
            <Show
              when={
                !p().plan.kept.length &&
                !p().plan.converted.length &&
                !p().plan.legacy.length &&
                !p().plan.removed.length
              }
            >
              <p class="text-sm text-muted-foreground">{m.item_type_nothing_to_move()}</p>
            </Show>
            <Show when={missingFields().length}>
              <div class="grid gap-2">
                <h3 class="text-sm font-medium">{m.item_type_missing()}</h3>
                <AttributeFields form={form} fields={missingFields()} idPrefix="type-attr" />
              </div>
            </Show>
          </div>
        )}
      </Show>
    </ActionDialog>
  );
}

export function OwnerAction(props: { detail: ItemDetail; user: SessionUser }) {
  const write = useItemWrite();
  const [open, setOpen] = createSignal(false);
  const current = (): OwnerValue => ({
    ownerKind: props.detail.owner.kind,
    ownerId: props.detail.owner.id,
  });
  const [owner, setOwner] = createSignal<OwnerValue>(current());
  async function submit() {
    const it = props.detail.item;
    const r = await write(
      () => changeItemOwnerFn({ data: { id: it.id, version: it.version, owner: owner() } }),
      { success: m.item_owner_changed() },
    );
    if (r) setOpen(false);
  }
  return (
    <ActionDialog
      label={m.item_action_owner()}
      open={open()}
      onOpenChange={(o) => {
        if (o) setOwner(current());
        setOpen(o);
      }}
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {m.common_cancel()}
          </Button>
          <Button onClick={submit}>{m.common_save()}</Button>
        </>
      }
    >
      <div class="grid gap-2">
        <label for="owner-change" class="text-sm font-medium">
          {m.item_field_owner()}
        </label>
        <OwnerSelect
          id="owner-change"
          user={props.user}
          value={owner()}
          onChange={setOwner}
          currentName={props.detail.owner.name}
          describedBy="owner-change-hint"
        />
        <p id="owner-change-hint" class="text-sm text-muted-foreground">
          {owner().ownerKind === "household" && props.detail.item.visibility === "private"
            ? m.item_owner_household_visibility()
            : m.item_owner_hint()}
        </p>
      </div>
    </ActionDialog>
  );
}

export function VisibilityAction(props: { detail: ItemDetail }) {
  const write = useItemWrite();
  const [open, setOpen] = createSignal(false);
  const [v, setV] = createSignal(props.detail.item.visibility);
  async function submit() {
    const it = props.detail.item;
    const r = await write(
      () => setItemVisibilityFn({ data: { id: it.id, version: it.version, visibility: v() } }),
      { success: m.item_visibility_changed() },
    );
    if (r) setOpen(false);
  }
  return (
    <ActionDialog
      label={m.item_action_visibility()}
      open={open()}
      onOpenChange={(o) => {
        if (o) setV(props.detail.item.visibility);
        setOpen(o);
      }}
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {m.common_cancel()}
          </Button>
          <Button disabled={v() === props.detail.item.visibility} onClick={submit}>
            {m.common_save()}
          </Button>
        </>
      }
    >
      <VisibilityChoice
        name="visibility-change"
        value={v()}
        onChange={setV}
        householdOwned={props.detail.owner.kind === "household"}
      />
    </ActionDialog>
  );
}

export function DeleteAction(props: { detail: ItemDetail }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <ConfirmButton
      label={m.item_action_delete()}
      question={m.item_delete_question({ name: props.detail.item.name })}
      destructive
      variant="destructive"
      size="default"
      onConfirm={async () => {
        const it = props.detail.item;
        const r = await runAction(
          () => deleteItemFn({ data: { id: it.id, version: it.version } }),
          {
            success: m.item_deleted({ name: it.name }),
            onError: (err) => {
              if (parseItemsError(err).code === "VERSION_CONFLICT")
                void qc.invalidateQueries({ queryKey: ["items"] });
              return false;
            },
          },
        );
        if (!r) return;
        await navigate({ to: "/items", replace: true });
        qc.removeQueries({ queryKey: ["items", "detail", it.id] });
        await qc.invalidateQueries({ queryKey: ["items"] });
        await qc.invalidateQueries({ queryKey: ["locations"] });
      }}
    />
  );
}

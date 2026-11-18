// Schema editor for one item type: meta data, own fields (add, reorder, rename,
// hide/unhide, per-kind options), inherited fields read-only, and a live preview
// of the resulting form. Saving an edit that would change stored values opens
// the migration preview dialog first (DESIGN §4.3).
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, createUniqueId, For, type JSX, Show } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
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
import { Textarea } from "~/components/ui/textarea";
import { showToast } from "~/components/ui/toast";
import { cn } from "~/lib/cn";
import { parseDecimalDe } from "~/lib/format";
import { fieldKindLabel, sizeSystemLabel } from "~/lib/item-types/display";
import { itemTypeErrorMessage } from "~/lib/item-types/errors";
import {
  activeFields,
  blankField,
  FIELD_KINDS,
  type FieldDefinition,
  type FieldKind,
  ISBN_LOOKUPS,
  type IsbnLookup,
  MULTIPLE_KINDS,
  SIZE_SYSTEMS,
  type SizeSystem,
} from "~/lib/item-types/fields";
import { TYPE_ICON_KEYS, TYPE_ICONS, typeIconGlyph } from "~/lib/item-types/icons";
import { itemTypeQuery } from "~/lib/item-types/queries";
import { flattenTree, type TreeNode } from "~/lib/item-types/tree";
import {
  createItemTypeInput,
  suggestKey,
  TRACKING_MODES,
  type TrackingMode,
} from "~/lib/item-types/type-input";
import { WARRANTY_NOTICE_DAYS } from "~/lib/warranty";
import { m } from "~/paraglide/messages";
import { createItemTypeFn, updateItemTypeFn } from "~/server/item-types/functions";
import type { ItemTypeSummary, MigrationPreview } from "~/server/item-types/service";
import { AttributesPreviewForm } from "./attribute-fields";

export type TypeDraft = {
  key: string;
  name: string;
  icon: string | null;
  tracking: TrackingMode;
  parentId: string | null;
  fields: FieldDefinition[];
};

type DraftField = { uid: string; saved: boolean; keyTouched: boolean; def: FieldDefinition };

export const trackingLabel = (t: TrackingMode) =>
  t === "stock" ? m.types_tracking_stock() : m.types_tracking_individual();

const lookupLabel = (l: IsbnLookup) =>
  ({
    dnb: m.field_lookup_dnb,
    openlibrary: m.field_lookup_openlibrary,
    google: m.field_lookup_google,
  })[l]();

let uidCounter = 0;
const nextUid = () => `f${++uidCounter}`;

export function TypeEditor(props: {
  mode: "create" | "edit";
  typeId?: string;
  initial: TypeDraft;
  tree: TreeNode<ItemTypeSummary>[];
  readOnly?: boolean;
  onSaved: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = createStore({
    key: props.initial.key,
    name: props.initial.name,
    icon: props.initial.icon,
    tracking: props.initial.tracking,
    parentId: props.initial.parentId,
    keyTouched: props.mode === "edit",
    fields: props.initial.fields.map(
      (def): DraftField => ({
        uid: nextUid(),
        saved: props.mode === "edit",
        keyTouched: true,
        def,
      }),
    ),
  });
  const [errors, setErrors] = createSignal<{
    meta: Record<string, string>;
    fields: Record<string, string[]>;
  }>({
    meta: {},
    fields: {},
  });
  const [formError, setFormError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [preview, setPreview] = createSignal<MigrationPreview | null>(null);
  const [previewChanged, setPreviewChanged] = createSignal(false);

  const parentQuery = useQuery(() => ({
    ...itemTypeQuery(draft.parentId ?? ""),
    enabled: !!draft.parentId,
  }));
  const inherited = () => (draft.parentId ? (parentQuery.data?.effectiveFields ?? []) : []);
  const defs = () => draft.fields.map((f) => f.def);
  const effective = createMemo(() => [...inherited(), ...defs()]);

  // Possible parents: every type except this one and its descendants.
  const parentOptions = createMemo(() => {
    const flat = flattenTree(props.tree);
    if (!props.typeId) return flat;
    const banned = new Set<string>();
    const mark = (n: TreeNode<ItemTypeSummary>) => {
      banned.add(n.id);
      for (const c of n.children) mark(c);
    };
    const self = flat.find((n) => n.id === props.typeId);
    if (self) mark(self);
    return flat.filter((n) => !banned.has(n.id));
  });

  const typeNames = createMemo(() => new Map(flattenTree(props.tree).map((n) => [n.id, n.name])));
  function uniqueKey(base: string, exceptUid?: string) {
    const taken = new Set([
      ...inherited().map((f) => f.key),
      ...draft.fields.filter((f) => f.uid !== exceptUid).map((f) => f.def.key),
    ]);
    const b = base || "field";
    let k = b;
    for (let i = 2; taken.has(k); i++) k = `${b.slice(0, 44)}_${i}`;
    return k;
  }

  function addField() {
    const label = m.types_new_field_label();
    const key = uniqueKey(suggestKey(label) || "field");
    setDraft("fields", (l) => [
      ...l,
      { uid: nextUid(), saved: false, keyTouched: false, def: blankField("text", key, label) },
    ]);
    queueMicrotask(() => {
      const el = document.getElementById(`${draft.fields.at(-1)?.uid}-label`);
      el?.focus();
      if (el instanceof HTMLInputElement) el.select();
    });
  }

  const setDef = (uid: string, def: FieldDefinition) =>
    setDraft("fields", (f) => f.uid === uid, "def", def);

  function moveTo(from: number, to: number) {
    if (from < 0 || to < 0 || from === to) return;
    setDraft(
      "fields",
      produce((l) => {
        const [x] = l.splice(from, 1);
        l.splice(to, 0, x!);
      }),
    );
  }

  function payloadFields(): FieldDefinition[] {
    return unwrap(draft.fields).map((f) => structuredClone(unwrap(f.def)));
  }

  function validate(): boolean {
    const fields = payloadFields();
    const meta: Record<string, string> = {};
    const r = createItemTypeInput.safeParse({
      key: draft.key,
      name: draft.name,
      icon: draft.icon,
      tracking: draft.tracking,
      parentId: draft.parentId,
      fields,
    });
    const fieldErrors: Record<string, string[]> = {};
    const addFieldError = (uid: string, msg: string) => {
      fieldErrors[uid] = [...(fieldErrors[uid] ?? []), msg];
    };
    if (!r.success) {
      for (const issue of r.error.issues) {
        const [head, idx] = issue.path;
        if (head === "fields" && typeof idx === "number") {
          const uid = draft.fields[idx]?.uid;
          if (uid) addFieldError(uid, issue.message);
        } else if (typeof head === "string" && !meta[head]) meta[head] = issue.message;
      }
    }
    for (const f of draft.fields)
      if (inherited().some((i) => i.key === f.def.key))
        addFieldError(f.uid, m.types_error_key_collision({ key: f.def.key }));
    setErrors({ meta, fields: fieldErrors });
    return r.success && Object.keys(fieldErrors).length === 0;
  }

  async function save(confirmAffected?: number) {
    setFormError(null);
    if (!validate()) {
      setFormError(m.types_error_fix_fields());
      return;
    }
    setSaving(true);
    try {
      const base = {
        name: draft.name,
        icon: draft.icon,
        tracking: draft.tracking,
        parentId: draft.parentId,
        fields: payloadFields(),
      };
      if (props.mode === "create") {
        const r = await createItemTypeFn({ data: { key: draft.key, ...base } });
        await queryClient.invalidateQueries({ queryKey: ["item-types"] });
        showToast({ title: m.types_created(), variant: "success" });
        props.onSaved(r.id);
        return;
      }
      const r = await updateItemTypeFn({ data: { id: props.typeId!, ...base, confirmAffected } });
      if (r.status === "confirm") {
        setPreviewChanged(confirmAffected !== undefined);
        setPreview(r.preview);
        return;
      }
      setPreview(null);
      setDraft("fields", (f) => !f.saved, "saved", true);
      await queryClient.invalidateQueries({ queryKey: ["item-types"] });
      showToast({
        title: r.migratedItems
          ? m.types_saved_migrated({ count: String(r.migratedItems) })
          : m.types_saved(),
        variant: "success",
      });
      props.onSaved(props.typeId!);
    } catch (err) {
      setFormError(itemTypeErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const visible = () => draft.fields.filter((f) => !f.def.hidden);
  const hidden = () => draft.fields.filter((f) => f.def.hidden);
  const indexOf = (uid: string) => draft.fields.findIndex((f) => f.uid === uid);

  return (
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <form
        class="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={props.readOnly} class="grid gap-4">
          <Card>
            <CardContent class="grid gap-4 pt-4">
              <div class="grid gap-2">
                <Label for="type-name">{m.types_name()}</Label>
                <Input
                  id="type-name"
                  value={draft.name}
                  aria-invalid={!!errors().meta.name || undefined}
                  aria-describedby={errors().meta.name ? "type-name-error" : undefined}
                  onInput={(e) => {
                    setDraft("name", e.currentTarget.value);
                    if (props.mode === "create" && !draft.keyTouched)
                      setDraft("key", suggestKey(e.currentTarget.value));
                  }}
                />
                <ErrorText id="type-name-error" text={errors().meta.name} />
              </div>
              <div class="grid gap-2">
                <Label for="type-key">{m.types_key()}</Label>
                <Input
                  id="type-key"
                  value={draft.key}
                  readOnly={props.mode === "edit"}
                  class={cn(props.mode === "edit" && "bg-muted")}
                  autocapitalize="none"
                  spellcheck={false}
                  aria-invalid={!!errors().meta.key || undefined}
                  aria-describedby="type-key-help"
                  onInput={(e) => {
                    setDraft({ key: e.currentTarget.value, keyTouched: true });
                  }}
                />
                <p id="type-key-help" class="text-sm text-muted-foreground">
                  {m.types_key_help()}
                </p>
                <ErrorText text={errors().meta.key} />
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="grid gap-2">
                  <Label for="type-parent">{m.types_parent()}</Label>
                  <select
                    id="type-parent"
                    class={inputClass}
                    value={draft.parentId ?? ""}
                    onChange={(e) => setDraft("parentId", e.currentTarget.value || null)}
                  >
                    <option value="">{m.types_parent_none()}</option>
                    <For each={parentOptions()}>
                      {(n) => (
                        <option value={n.id}>
                          {`${"  ".repeat(n.depth)}${typeIconGlyph(n.icon)} ${n.name}`}
                        </option>
                      )}
                    </For>
                  </select>
                </div>
                <div class="grid gap-2">
                  <Label for="type-tracking">{m.types_tracking()}</Label>
                  <select
                    id="type-tracking"
                    class={inputClass}
                    value={draft.tracking}
                    onChange={(e) => setDraft("tracking", e.currentTarget.value as TrackingMode)}
                  >
                    <For each={TRACKING_MODES}>
                      {(t) => <option value={t}>{trackingLabel(t)}</option>}
                    </For>
                  </select>
                </div>
              </div>
              <IconPicker value={draft.icon} onChange={(i) => setDraft("icon", i)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{m.types_fields()}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent class="grid gap-3">
              <Show when={inherited().length}>
                <ul class="grid gap-2">
                  <For each={activeFields(inherited())}>
                    {(f) => (
                      <li class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                        <span>
                          <span class="font-medium">{f.label}</span>{" "}
                          <span class="text-muted-foreground">
                            · {fieldKindLabel(f.kind)} · <code>{f.key}</code>
                          </span>
                        </span>
                        <Badge variant="outline">
                          {m.types_inherited_from({ name: typeNames().get(f.sourceTypeId) ?? "" })}
                        </Badge>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={!visible().length}>
                <p class="text-sm text-muted-foreground">{m.types_no_fields()}</p>
              </Show>
              <ol class="grid gap-3">
                <For each={visible()}>
                  {(f, i) => (
                    <li>
                      <FieldEditor
                        field={f}
                        position={i() + 1}
                        isFirst={i() === 0}
                        isLast={i() === visible().length - 1}
                        errors={errors().fields[f.uid]}
                        onChange={(def) => setDef(f.uid, def)}
                        onLabel={(label) => {
                          const def = { ...unwrap(f.def), label };
                          if (!f.saved && !f.keyTouched)
                            def.key = uniqueKey(suggestKey(label), f.uid);
                          setDef(f.uid, def as FieldDefinition);
                        }}
                        onKey={(key) => {
                          setDraft("fields", (x) => x.uid === f.uid, "keyTouched", true);
                          setDef(f.uid, { ...unwrap(f.def), key } as FieldDefinition);
                        }}
                        onMove={(dir) => {
                          // Move past the neighbouring visible field (hidden ones keep their place).
                          const other = visible()[i() + dir];
                          if (other) moveTo(indexOf(f.uid), indexOf(other.uid));
                          queueMicrotask(() =>
                            document.getElementById(`${f.uid}-${dir < 0 ? "up" : "down"}`)?.focus(),
                          );
                        }}
                        onHide={() => {
                          if (f.saved)
                            setDef(f.uid, { ...unwrap(f.def), hidden: true } as FieldDefinition);
                          else setDraft("fields", (l) => l.filter((x) => x.uid !== f.uid));
                        }}
                      />
                    </li>
                  )}
                </For>
              </ol>
              <div>
                <Button variant="outline" onClick={addField}>
                  + {m.types_add_field()}
                </Button>
              </div>
              <Show when={hidden().length}>
                <section class="grid gap-2 border-t pt-3" aria-labelledby="hidden-fields-heading">
                  <h3 id="hidden-fields-heading" class="text-sm font-semibold">
                    {m.types_hidden_section()}
                  </h3>
                  <p class="text-sm text-muted-foreground">{m.types_hidden_hint()}</p>
                  <ul class="grid gap-2">
                    <For each={hidden()}>
                      {(f) => (
                        <li class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                          <span>
                            <span class="font-medium">{f.def.label}</span>{" "}
                            <span class="text-muted-foreground">
                              · {fieldKindLabel(f.def.kind)} · <code>{f.def.key}</code>
                            </span>
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const { hidden: _h, ...rest } = unwrap(f.def);
                              setDef(f.uid, rest as FieldDefinition);
                            }}
                          >
                            {m.types_unhide()}
                          </Button>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </Show>
            </CardContent>
          </Card>
        </fieldset>

        <Show when={formError()}>
          <p role="alert" class="text-sm font-medium text-destructive">
            {formError()}
          </p>
        </Show>
        <Show when={!props.readOnly}>
          <div class="sticky bottom-16 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0">
            <Button type="submit" class="w-full sm:w-auto" disabled={saving()}>
              {m.common_save()}
            </Button>
          </div>
        </Show>
      </form>

      <aside class="lg:sticky lg:top-18" aria-labelledby="type-preview-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="type-preview-heading">
                {typeIconGlyph(draft.icon)} {m.types_preview()}: {draft.name}
              </h2>
            </CardTitle>
            <p class="text-sm text-muted-foreground">{m.types_preview_hint()}</p>
          </CardHeader>
          <CardContent>
            <AttributesPreviewForm fields={effective()} />
          </CardContent>
        </Card>
      </aside>

      <MigrationDialog
        preview={preview()}
        changed={previewChanged()}
        busy={saving()}
        onCancel={() => setPreview(null)}
        onConfirm={() => void save(preview()?.affectedItems)}
      />
    </div>
  );
}

function ErrorText(props: { id?: string; text?: string }) {
  return (
    <Show when={props.text}>
      <p id={props.id} class="text-sm font-medium text-destructive">
        {props.text}
      </p>
    </Show>
  );
}

function IconPicker(props: { value: string | null; onChange: (v: string) => void }) {
  return (
    <fieldset class="grid gap-2">
      <legend class="mb-2 text-sm font-medium">{m.types_icon()}</legend>
      <div class="flex flex-wrap gap-1">
        <For each={TYPE_ICON_KEYS}>
          {(k) => (
            <label class="relative" title={k}>
              <input
                type="radio"
                name="type-icon"
                value={k}
                class="peer sr-only"
                aria-label={k}
                checked={props.value === k}
                onChange={() => props.onChange(k)}
              />
              <span
                aria-hidden="true"
                class={cn(
                  "flex size-11 cursor-pointer items-center justify-center rounded-md border text-xl peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  props.value === k
                    ? "border-primary bg-accent ring-1 ring-primary"
                    : "border-transparent hover:bg-accent",
                )}
              >
                {TYPE_ICONS[k]}
              </span>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
}

function NumberOption(props: {
  id: string;
  label: string;
  value: number | undefined;
  integer?: boolean;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div class="grid gap-1">
      <Label for={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        inputmode={props.integer ? "numeric" : "decimal"}
        value={props.value === undefined ? "" : String(props.value).replace(".", ",")}
        onChange={(e) => {
          const n = parseDecimalDe(e.currentTarget.value);
          props.onChange(n === null ? undefined : props.integer ? Math.trunc(n) : n);
        }}
      />
    </div>
  );
}

function FieldEditor(props: {
  field: DraftField;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  errors?: string[];
  onChange: (def: FieldDefinition) => void;
  onLabel: (label: string) => void;
  onKey: (key: string) => void;
  onMove: (dir: -1 | 1) => void;
  onHide: () => void;
}) {
  const uid = () => props.field.uid;
  const def = () => props.field.def;
  const patch = (p: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...unwrap(def()), ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    props.onChange(next as FieldDefinition);
  };
  const any = () => def() as Record<string, unknown> & FieldDefinition;
  const changeKind = (kind: FieldKind) => {
    const d = def();
    const fresh = blankField(kind, d.key, d.label) as Record<string, unknown>;
    if (d.required && kind !== "boolean") fresh.required = true;
    if (d.help) fresh.help = d.help;
    if ("multiple" in d && d.multiple && MULTIPLE_KINDS.includes(kind)) fresh.multiple = true;
    if ((kind === "select" || kind === "multiselect") && "options" in d)
      fresh.options = [...d.options];
    props.onChange(fresh as FieldDefinition);
  };
  const id = (s: string) => `${uid()}-${s}`;
  const headingId = createUniqueId();

  const optionsBlock = (): JSX.Element => {
    const d = def();
    switch (d.kind) {
      case "text":
      case "longtext":
        return (
          <NumberOption
            id={id("maxlen")}
            label={m.types_field_max_length()}
            integer
            value={d.maxLength}
            onChange={(v) => patch({ maxLength: v && v > 0 ? v : undefined })}
          />
        );
      case "integer":
      case "decimal":
      case "measure":
        return (
          <div class="grid gap-3 sm:grid-cols-3">
            <NumberOption
              id={id("min")}
              label={m.types_field_min()}
              integer={d.kind === "integer"}
              value={d.min}
              onChange={(v) => patch({ min: v })}
            />
            <NumberOption
              id={id("max")}
              label={m.types_field_max()}
              integer={d.kind === "integer"}
              value={d.max}
              onChange={(v) => patch({ max: v })}
            />
            <Show
              when={d.kind === "measure"}
              fallback={
                <div class="grid gap-1">
                  <Label for={id("unit")}>{m.types_field_unit()}</Label>
                  <Input
                    id={id("unit")}
                    value={(any().unit as string | undefined) ?? ""}
                    onChange={(e) => patch({ unit: e.currentTarget.value.trim() || undefined })}
                  />
                </div>
              }
            >
              <div class="grid gap-1">
                <Label for={id("units")}>{m.types_field_units()}</Label>
                <Input
                  id={id("units")}
                  value={((any().units as string[] | undefined) ?? []).join(", ")}
                  onChange={(e) =>
                    patch({
                      units: e.currentTarget.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </Show>
          </div>
        );
      case "date":
        return (
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="grid gap-1">
              <Label for={id("dmin")}>{m.types_field_min()}</Label>
              <Input
                id={id("dmin")}
                type="date"
                value={d.min ?? ""}
                onChange={(e) => patch({ min: e.currentTarget.value || undefined })}
              />
            </div>
            <div class="grid gap-1">
              <Label for={id("dmax")}>{m.types_field_max()}</Label>
              <Input
                id={id("dmax")}
                type="date"
                value={d.max ?? ""}
                onChange={(e) => patch({ max: e.currentTarget.value || undefined })}
              />
            </div>
            <div class="grid gap-1 sm:col-span-2">
              <Checkbox
                class="min-h-10"
                label={m.types_field_warranty()}
                checked={d.warranty === true}
                onChange={(on: boolean) => patch({ warranty: on || undefined })}
              />
              <p class="text-xs text-muted-foreground">
                {m.types_field_warranty_hint({ days: String(WARRANTY_NOTICE_DAYS) })}
              </p>
            </div>
          </div>
        );
      case "select":
      case "multiselect":
        return (
          <div class="grid gap-1">
            <Label for={id("options")}>{m.types_field_options()}</Label>
            <Textarea
              id={id("options")}
              value={d.options.join("\n")}
              onChange={(e) =>
                patch({
                  options: e.currentTarget.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        );
      case "isbn":
        return (
          <fieldset class="grid gap-1">
            <legend class="mb-1 text-sm font-medium">{m.types_field_lookup()}</legend>
            <For each={ISBN_LOOKUPS}>
              {(l) => (
                <Checkbox
                  class="min-h-10"
                  label={lookupLabel(l)}
                  checked={(d.lookup ?? []).includes(l)}
                  onChange={(on: boolean) => {
                    const cur = d.lookup ?? [];
                    const next = on
                      ? ISBN_LOOKUPS.filter((x) => x === l || cur.includes(x))
                      : cur.filter((x) => x !== l);
                    patch({ lookup: next.length ? next : undefined });
                  }}
                />
              )}
            </For>
          </fieldset>
        );
      case "size":
        return (
          <fieldset class="grid gap-1">
            <legend class="mb-1 text-sm font-medium">{m.types_field_systems()}</legend>
            <For each={SIZE_SYSTEMS}>
              {(s: SizeSystem) => (
                <Checkbox
                  class="min-h-10"
                  label={sizeSystemLabel(s)}
                  checked={d.systems.includes(s)}
                  onChange={(on: boolean) =>
                    patch({
                      systems: on
                        ? SIZE_SYSTEMS.filter((x) => x === s || d.systems.includes(x))
                        : d.systems.filter((x) => x !== s),
                    })
                  }
                />
              )}
            </For>
          </fieldset>
        );
      default:
        return null;
    }
  };

  return (
    <section
      class={cn("grid gap-3 rounded-lg border p-3", props.errors?.length && "border-destructive")}
      aria-labelledby={headingId}
    >
      <div class="flex items-start justify-between gap-2">
        <h3 id={headingId} class="pt-2 text-sm font-semibold">
          {m.types_field_number({ n: String(props.position), label: def().label })}
        </h3>
        <div class="flex gap-1">
          <Button
            id={id("up")}
            variant="ghost"
            size="icon"
            aria-label={m.types_move_up({ label: def().label })}
            disabled={props.isFirst}
            onClick={() => props.onMove(-1)}
          >
            ↑
          </Button>
          <Button
            id={id("down")}
            variant="ghost"
            size="icon"
            aria-label={m.types_move_down({ label: def().label })}
            disabled={props.isLast}
            onClick={() => props.onMove(1)}
          >
            ↓
          </Button>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="grid gap-1">
          <Label for={id("label")}>{m.types_field_label()}</Label>
          <Input
            id={id("label")}
            value={def().label}
            onInput={(e) => props.onLabel(e.currentTarget.value)}
          />
        </div>
        <div class="grid gap-1">
          <Label for={id("kind")}>{m.types_field_kind()}</Label>
          <select
            id={id("kind")}
            class={inputClass}
            value={def().kind}
            onChange={(e) => changeKind(e.currentTarget.value as FieldKind)}
          >
            <For each={FIELD_KINDS}>{(k) => <option value={k}>{fieldKindLabel(k)}</option>}</For>
          </select>
        </div>
        <div class="grid gap-1">
          <Label for={id("key")}>{m.types_field_key()}</Label>
          <Input
            id={id("key")}
            value={def().key}
            readOnly={props.field.saved}
            class={cn(props.field.saved && "bg-muted")}
            autocapitalize="none"
            spellcheck={false}
            aria-describedby={props.field.saved ? id("key-help") : undefined}
            onInput={(e) => props.onKey(e.currentTarget.value)}
          />
          <Show when={props.field.saved}>
            <p id={id("key-help")} class="text-xs text-muted-foreground">
              {m.types_field_key_locked()}
            </p>
          </Show>
        </div>
        <div class="grid gap-1">
          <Label for={id("help")}>{m.types_field_help()}</Label>
          <Input
            id={id("help")}
            value={def().help ?? ""}
            onChange={(e) => patch({ help: e.currentTarget.value.trim() || undefined })}
          />
        </div>
      </div>
      {optionsBlock()}
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Show when={def().kind !== "boolean"}>
          <Checkbox
            class="min-h-10"
            label={m.types_field_required()}
            checked={def().required === true}
            onChange={(on: boolean) => patch({ required: on || undefined })}
          />
        </Show>
        <Show when={MULTIPLE_KINDS.includes(def().kind)}>
          <Checkbox
            class="min-h-10"
            label={m.types_field_multiple()}
            checked={any().multiple === true}
            onChange={(on: boolean) => patch({ multiple: on || undefined })}
          />
        </Show>
        <Button variant="ghost" size="sm" class="ml-auto" onClick={() => props.onHide()}>
          {props.field.saved ? m.types_hide() : m.types_remove_field()}
        </Button>
      </div>
      <Show when={props.errors?.length}>
        <ul class="grid gap-1 text-sm font-medium text-destructive">
          <For each={props.errors}>{(e) => <li>{e}</li>}</For>
        </ul>
      </Show>
    </section>
  );
}

function MigrationDialog(props: {
  preview: MigrationPreview | null;
  changed: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!props.preview} onOpenChange={(o) => !o && props.onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.types_migration_title()}</DialogTitle>
          <DialogDescription>
            {m.types_migration_body({ count: String(props.preview?.affectedItems ?? 0) })}
          </DialogDescription>
        </DialogHeader>
        <Show when={props.changed}>
          <p role="alert" class="text-sm font-medium text-destructive">
            {m.types_migration_changed()}
          </p>
        </Show>
        <ul class="grid list-disc gap-1 pl-5 text-sm">
          <For each={props.preview?.byKey ?? []}>
            {(k) => (
              <>
                <Show when={k.removed}>
                  <li>
                    {k.removed === 1
                      ? m.types_migration_lose_one({ label: k.label, key: k.key })
                      : m.types_migration_lose_other({
                          count: String(k.removed),
                          label: k.label,
                          key: k.key,
                        })}
                  </li>
                </Show>
                <Show when={k.converted}>
                  <li>
                    {k.converted === 1
                      ? m.types_migration_convert_one({ label: k.label })
                      : m.types_migration_convert_other({
                          count: String(k.converted),
                          label: k.label,
                        })}
                  </li>
                </Show>
              </>
            )}
          </For>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={props.onCancel}>
            {m.common_cancel()}
          </Button>
          <Button variant="destructive" disabled={props.busy} onClick={props.onConfirm}>
            {m.types_migration_confirm()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

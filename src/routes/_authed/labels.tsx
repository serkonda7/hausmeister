// Label sheets (DESIGN §5.2): QR labels for items and locations, printed on
// A4 Avery Zweckform L4732 (80 per sheet, with an offset for a sheet that is
// already partly used) or on 62 × 29 mm thermal labels. Each QR code is the
// full /q/<code> URL, so the phone's camera app opens it as well. What to
// print lives in the URL (?item=…&location=…), so item and location pages
// link straight here. Page size and layout: src/styles/app.css.
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { z } from "zod";
import { ItemPicker, searchVisibleItems } from "~/components/item-types/pickers";
import { LocationSelect } from "~/components/items/location-picker";
import { QrCode } from "~/components/labels/qr-code";
import { Button } from "~/components/ui/button";
import { inputClass } from "~/components/ui/input";
import { useHydrated } from "~/lib/hydrated";
import { labelUrl } from "~/lib/qr";
import { actionErrorText } from "~/lib/run-action";
import type { LabelEntry } from "~/lib/scan/types";
import { m } from "~/paraglide/messages";
import { getLabelsFn } from "~/server/scan/functions";

const PER_SHEET = 80;
const ids = z
  .union([z.string().max(64), z.array(z.string().max(64)).max(400)])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .catch([]);

const searchSchema = z.object({
  item: ids,
  location: ids,
  format: z.enum(["a4", "thermal"]).optional().catch(undefined),
  skip: z.coerce
    .number()
    .int()
    .min(0)
    .max(PER_SHEET - 1)
    .optional()
    .catch(undefined),
});

const labelsQuery = (itemIds: string[], locationIds: string[]) => ({
  queryKey: ["items", "labels", itemIds, locationIds],
  queryFn: () => getLabelsFn({ data: { itemIds, locationIds } }),
});

export const Route = createFileRoute("/_authed/labels")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ item: search.item, location: search.location }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(labelsQuery(deps.item, deps.location)),
  head: () => ({ meta: [{ title: `${m.labels_title()} · ${m.app_name()}` }] }),
  component: LabelsPage,
});

function Label(props: { entry: LabelEntry; origin: string; thermal: boolean }) {
  const url = () => labelUrl(props.origin, props.entry.shortCode);
  return (
    <div
      class={
        props.thermal
          ? "label-sheet-thermal flex items-center gap-[2mm] overflow-hidden bg-white p-[2mm] text-black shadow print:shadow-none"
          : "flex items-center gap-[1mm] overflow-hidden bg-white p-[0.8mm] text-black"
      }
      data-testid="label"
    >
      <QrCode
        value={url()}
        label={m.labels_qr_alt({ code: props.entry.shortCode })}
        class={props.thermal ? "size-[25mm] shrink-0" : "size-[15mm] shrink-0"}
      />
      <div class="grid min-w-0 gap-[0.5mm] leading-tight">
        <span
          class={
            props.thermal
              ? "line-clamp-3 hyphens-auto break-words text-[10pt] font-semibold"
              : "line-clamp-2 hyphens-auto break-words text-[6.5pt] font-semibold"
          }
        >
          {props.entry.name}
        </span>
        <Show when={props.thermal && props.entry.context}>
          <span class="truncate text-[7pt]">{props.entry.context}</span>
        </Show>
        <span
          class={
            props.thermal
              ? "font-mono text-[11pt] font-bold tracking-wider"
              : "font-mono text-[7pt] font-bold tracking-wide"
          }
        >
          {props.entry.shortCode}
        </span>
      </div>
    </div>
  );
}

function LabelsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/labels" });
  const hydrated = useHydrated();
  const q = useQuery(() => labelsQuery(search().item, search().location));
  const format = () => search().format ?? "a4";
  const skip = () => (format() === "a4" ? (search().skip ?? 0) : 0);
  const [loc, setLoc] = createSignal<string | null>(null);
  const names = createMemo(() => new Map((q.data?.labels ?? []).map((l) => [l.id, l.name])));

  const patch = (p: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (s) => ({ ...s, ...p }), replace: true });

  // A4: blanks for the used labels, then the labels; 80 per sheet.
  const sheets = createMemo(() => {
    const list: (LabelEntry | null)[] = [
      ...Array.from({ length: skip() }, () => null),
      ...(q.data?.labels ?? []),
    ];
    const out: (LabelEntry | null)[][] = [];
    for (let i = 0; i < list.length; i += PER_SHEET) out.push(list.slice(i, i + PER_SHEET));
    return out;
  });

  return (
    <div class="grid gap-4">
      <div class="grid gap-4 print:hidden">
        <h1 class="text-2xl font-semibold">{m.labels_title()}</h1>
        <p class="text-sm text-muted-foreground">{m.labels_intro()}</p>
        <fieldset class="grid gap-1">
          <legend class="mb-1 text-sm font-medium">{m.labels_format()}</legend>
          <label class="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="label-format"
              class="size-4 accent-primary"
              checked={format() === "a4"}
              disabled={!hydrated()}
              onChange={() => patch({ format: "a4" })}
            />
            {m.labels_format_a4()}
          </label>
          <label class="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="label-format"
              class="size-4 accent-primary"
              checked={format() === "thermal"}
              disabled={!hydrated()}
              onChange={() => patch({ format: "thermal" })}
            />
            {m.labels_format_thermal()}
          </label>
        </fieldset>
        <Show when={format() === "a4"}>
          <div class="grid gap-2 sm:max-w-xs">
            <label for="label-skip" class="text-sm font-medium">
              {m.labels_skip()}
            </label>
            <input
              id="label-skip"
              type="number"
              min="0"
              max={PER_SHEET - 1}
              class={inputClass}
              value={skip()}
              disabled={!hydrated()}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                patch({ skip: Number.isInteger(n) && n > 0 && n < PER_SHEET ? n : undefined });
              }}
              aria-describedby="label-skip-hint"
            />
            <p id="label-skip-hint" class="text-sm text-muted-foreground">
              {m.labels_skip_hint()}
            </p>
          </div>
        </Show>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid content-start gap-2">
            <label for="label-items" class="text-sm font-medium">
              {m.labels_items()}
            </label>
            <ItemPicker
              id="label-items"
              label={m.labels_items()}
              multiple
              value={search().item}
              onChange={(v) =>
                patch({ item: Array.isArray(v) ? v : typeof v === "string" ? [v] : [] })
              }
              search={searchVisibleItems}
              itemName={(id) => names().get(id)}
              disabled={!hydrated()}
            />
          </div>
          <div class="grid content-start gap-2">
            <label for="label-location" class="text-sm font-medium">
              {m.labels_add_location()}
            </label>
            <div class="flex gap-2">
              <LocationSelect
                id="label-location"
                value={loc()}
                onChange={setLoc}
                noneLabel={m.labels_pick_location()}
                disabled={!hydrated()}
              />
              <Button
                variant="outline"
                disabled={!loc() || !hydrated()}
                onClick={() => {
                  const id = loc();
                  if (id && !search().location.includes(id))
                    void patch({ location: [...search().location, id] });
                  setLoc(null);
                }}
              >
                {m.labels_add()}
              </Button>
            </div>
            <Show when={search().location.length}>
              <ul class="flex flex-wrap gap-2">
                <For each={search().location}>
                  {(id) => (
                    <li class="inline-flex items-center gap-1 rounded-full border bg-secondary py-1 pl-3 pr-1 text-sm">
                      {names().get(id) ?? "…"}
                      <button
                        type="button"
                        class="flex size-8 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={m.labels_remove({ name: names().get(id) ?? "" })}
                        onClick={() =>
                          patch({ location: search().location.filter((x) => x !== id) })
                        }
                      >
                        ✕
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={!hydrated() || !(q.data?.labels.length ?? 0)}
            onClick={() => window.print()}
          >
            {m.labels_print({ count: q.data?.labels.length ?? 0 })}
          </Button>
          <p class="text-sm text-muted-foreground">{m.labels_print_hint()}</p>
        </div>
        <Show when={q.isError}>
          <p role="alert" class="text-sm text-destructive">
            {actionErrorText(q.error)}
          </p>
        </Show>
        <Show when={q.isSuccess && !q.data.labels.length}>
          <p class="text-muted-foreground">{m.labels_empty()}</p>
        </Show>
      </div>

      <Show when={q.data?.labels.length}>
        <section class="overflow-x-auto print:overflow-visible" aria-label={m.labels_preview()}>
          <Show
            when={format() === "a4"}
            fallback={
              <div class="grid justify-start gap-3 print:block">
                <For each={q.data?.labels}>
                  {(l) => <Label entry={l} origin={q.data?.origin ?? ""} thermal />}
                </For>
              </div>
            }
          >
            <div class="grid justify-start gap-4 print:block">
              <For each={sheets()}>
                {(sheet) => (
                  <div class="label-sheet-a4 bg-white shadow print:shadow-none">
                    <For each={sheet}>
                      {(l) =>
                        l ? (
                          <Label entry={l} origin={q.data?.origin ?? ""} thermal={false} />
                        ) : (
                          <div aria-hidden="true" />
                        )
                      }
                    </For>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>
      </Show>
    </div>
  );
}

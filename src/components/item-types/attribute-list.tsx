// Read-only display of an item's attributes, with legacy values under "Alte Felder".
import { For, Show } from "solid-js";
import { formatAttributeValue, formatUnknown, splitAttributes } from "~/lib/item-types/display";
import type { FieldDefinition } from "~/lib/item-types/fields";
import { m } from "~/paraglide/messages";
import { usePickerUsers } from "./pickers";

export function AttributeList(props: {
  /** Effective fields of the item's type (hidden ones included, for legacy labels). */
  fields: readonly FieldDefinition[];
  attributes: Record<string, unknown>;
  userName?: (id: string) => string | undefined;
  itemName?: (id: string) => string | undefined;
  /** Hide the "Alte Felder" section (e.g. in compact cards). */
  hideLegacy?: boolean;
}) {
  const users = usePickerUsers();
  const resolvers = () => ({
    userName: props.userName ?? users.nameOf,
    itemName: props.itemName,
  });
  const parts = () => splitAttributes(props.fields, props.attributes);
  const text = (e: { field?: FieldDefinition; value: unknown }) =>
    e.field ? formatAttributeValue(e.field, e.value, resolvers()) : formatUnknown(e.value);
  const swatch = (e: { field?: FieldDefinition; value: unknown }) =>
    e.field?.kind === "color" && typeof e.value === "string" ? e.value : undefined;

  const Entries = (p: { entries: ReturnType<typeof parts>["active"] }) => (
    <dl class="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
      <For each={p.entries}>
        {(e) => (
          <>
            <dt class="text-sm text-muted-foreground">{e.label}</dt>
            <dd class="flex items-center gap-2 break-words">
              <Show when={swatch(e)}>
                <span
                  class="inline-block size-4 rounded-sm border"
                  style={{ "background-color": swatch(e) }}
                  aria-hidden="true"
                />
              </Show>
              <Show
                when={e.field?.kind === "url" && typeof e.value === "string"}
                fallback={text(e)}
              >
                <a
                  class="text-primary underline"
                  href={e.value as string}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {e.value as string}
                </a>
              </Show>
            </dd>
          </>
        )}
      </For>
    </dl>
  );

  return (
    <div class="grid gap-4">
      <Show
        when={parts().active.length}
        fallback={<p class="text-sm text-muted-foreground">{m.field_none()}</p>}
      >
        <Entries entries={parts().active} />
      </Show>
      <Show when={!props.hideLegacy && parts().legacy.length}>
        <section
          class="grid gap-2 rounded-md border border-dashed p-3"
          aria-labelledby="legacy-heading"
        >
          <h3 id="legacy-heading" class="text-sm font-semibold">
            {m.field_legacy()}
          </h3>
          <p class="text-sm text-muted-foreground">{m.field_legacy_hint()}</p>
          <Entries entries={parts().legacy} />
        </section>
      </Show>
    </div>
  );
}

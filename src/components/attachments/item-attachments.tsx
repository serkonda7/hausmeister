// Everything attachment-related for an item page in one block: photos with
// the uploader, receipts (only shown from `edit`), manuals, other files.
//
//   <ItemAttachments itemId={item.id} level={item.level} />
import { useQuery } from "@tanstack/solid-query";
import { Show } from "solid-js";
import type { AttachmentKind } from "~/lib/attachments/rules";
import { m } from "~/paraglide/messages";
import type { Level } from "~/server/authz/levels";
import { AttachmentFileList } from "./file-list";
import { canEditAttachments } from "./format";
import { PhotoGallery } from "./gallery";
import { attachmentsQuery } from "./queries";
import { AttachmentUploader } from "./uploader";

export function ItemAttachments(props: { itemId: string; level: Level }) {
  const q = useQuery(() => attachmentsQuery(props.itemId));
  const has = (kind: AttachmentKind) => (q.data?.attachments ?? []).some((a) => a.kind === kind);
  const editable = () => canEditAttachments(props.level);
  return (
    <div class="grid gap-6">
      <section class="grid gap-2">
        <h2 class="text-lg font-semibold">{m.attachments_photos()}</h2>
        <PhotoGallery itemId={props.itemId} level={props.level} />
      </section>
      <Show when={editable()}>
        <section class="grid gap-2">
          <h2 class="text-lg font-semibold">{m.attachments_receipts()}</h2>
          <p class="text-xs text-muted-foreground">{m.attachments_receipts_hint()}</p>
          <AttachmentFileList itemId={props.itemId} level={props.level} kind="receipt" />
        </section>
      </Show>
      <Show when={editable() || has("manual")}>
        <section class="grid gap-2">
          <h2 class="text-lg font-semibold">{m.attachments_manuals()}</h2>
          <AttachmentFileList itemId={props.itemId} level={props.level} kind="manual" />
        </section>
      </Show>
      <Show when={has("other")}>
        <section class="grid gap-2">
          <h2 class="text-lg font-semibold">{m.attachments_others()}</h2>
          <AttachmentFileList itemId={props.itemId} level={props.level} kind="other" />
        </section>
      </Show>
      <AttachmentUploader itemId={props.itemId} level={props.level} />
    </div>
  );
}

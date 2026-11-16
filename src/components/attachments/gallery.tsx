// Photo gallery of an item: square thumbnails (cover first), tap for the full
// image with previous/next. Editors get "Als Titelbild", reorder and delete in
// the viewer. Reads attachmentsQuery(itemId); the server already filtered it.
//
//   <PhotoGallery itemId={id} level={level} />
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Show } from "solid-js";
import { ConfirmButton } from "~/components/confirm-dialog";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { fileUrl } from "~/lib/attachments/rules";
import { cn } from "~/lib/cn";
import { m } from "~/paraglide/messages";
import {
  deleteAttachmentFn,
  reorderAttachmentsFn,
  setCoverPhotoFn,
} from "~/server/attachments/functions";
import type { Level } from "~/server/authz/levels";
import { runAttachmentAction as act } from "./action";
import { canEditAttachments } from "./format";
import { attachmentsQuery, attachmentsQueryKey } from "./queries";

export function PhotoGallery(props: { itemId: string; level: Level; class?: string }) {
  const qc = useQueryClient();
  const q = useQuery(() => attachmentsQuery(props.itemId));
  const photos = createMemo(() => (q.data?.attachments ?? []).filter((a) => a.kind === "photo"));
  const editable = () => canEditAttachments(q.data?.level ?? props.level);
  const [open, setOpen] = createSignal<number | null>(null);
  const current = () => {
    const i = open();
    return i === null ? undefined : photos()[i];
  };
  const refresh = () => qc.invalidateQueries({ queryKey: attachmentsQueryKey(props.itemId) });

  async function move(delta: -1 | 1) {
    const i = open();
    if (i === null) return;
    const ids = photos().map((p) => p.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    const r = await act(() => reorderAttachmentsFn({ data: { itemId: props.itemId, order: ids } }));
    if (r) {
      qc.setQueryData(attachmentsQueryKey(props.itemId), r);
      setOpen(j);
    }
  }

  async function cover() {
    const p = current();
    if (!p) return;
    const r = await act(
      () => setCoverPhotoFn({ data: { attachmentId: p.id } }),
      m.attachments_cover_set(),
    );
    if (r) {
      qc.setQueryData(attachmentsQueryKey(props.itemId), r);
      setOpen(0);
    }
  }

  async function remove() {
    const p = current();
    if (!p) return;
    const r = await act(
      () => deleteAttachmentFn({ data: { attachmentId: p.id } }),
      m.attachments_deleted(),
    );
    if (r) {
      const left = photos().length - 1;
      setOpen(left > 0 ? Math.min(open() ?? 0, left - 1) : null);
      await refresh();
    }
  }

  const title = () => m.attachments_photo_title({ n: (open() ?? 0) + 1, total: photos().length });

  return (
    <div class={cn("grid gap-2", props.class)} data-testid="photo-gallery">
      <Show
        when={photos().length > 0}
        fallback={
          <Show when={q.isSuccess}>
            <p class="text-sm text-muted-foreground">{m.attachments_photos_empty()}</p>
          </Show>
        }
      >
        <ul class="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={m.attachments_photos()}>
          <For each={photos()}>
            {(p, i) => (
              <li class="relative">
                <button
                  type="button"
                  class="block aspect-square w-full overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setOpen(i())}
                >
                  <img
                    src={fileUrl(p.id, "thumb")}
                    alt={m.attachments_photo_alt({ n: i() + 1, total: photos().length })}
                    loading="lazy"
                    decoding="async"
                    class="size-full object-cover"
                  />
                </button>
                <Show when={i() === 0 && photos().length > 1}>
                  <span class="pointer-events-none absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium">
                    {m.attachments_cover()}
                  </span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Dialog open={open() !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent class="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title()}</DialogTitle>
          </DialogHeader>
          <Show when={current()}>
            {(p) => (
              <div class="grid gap-3">
                <a href={fileUrl(p().id)} target="_blank" rel="noopener" class="block">
                  <img
                    src={fileUrl(p().id)}
                    alt={title()}
                    class="mx-auto max-h-[65dvh] w-auto max-w-full rounded object-contain"
                  />
                </a>
                <div class="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={m.attachments_previous()}
                    disabled={(open() ?? 0) === 0}
                    onClick={() => setOpen((open() ?? 0) - 1)}
                  >
                    ‹
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={m.attachments_next()}
                    disabled={(open() ?? 0) >= photos().length - 1}
                    onClick={() => setOpen((open() ?? 0) + 1)}
                  >
                    ›
                  </Button>
                </div>
                <Show when={editable()}>
                  <div class="flex flex-wrap gap-2">
                    <Show when={(open() ?? 0) > 0}>
                      <Button size="sm" variant="outline" onClick={cover}>
                        {m.attachments_set_cover()}
                      </Button>
                    </Show>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(open() ?? 0) === 0}
                      onClick={() => move(-1)}
                    >
                      {m.attachments_move_earlier()}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(open() ?? 0) >= photos().length - 1}
                      onClick={() => move(1)}
                    >
                      {m.attachments_move_later()}
                    </Button>
                    <ConfirmButton
                      label={m.attachments_delete()}
                      question={m.attachments_delete_question({
                        name: p().originalName ?? title(),
                      })}
                      destructive
                      variant="destructive"
                      onConfirm={remove}
                    />
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Uploader for an item's attachments. Phone: "Foto aufnehmen" opens the rear
// camera, "Dateien auswählen" picks several files. Desktop: the same picker
// plus drag and drop onto the box. One request per file (two at a time), with
// progress, a German error per file, and retry.
//
//   <AttachmentUploader itemId={id} level={level} />                       // kind picker
//   <AttachmentUploader itemId={id} level={level} kinds={["photo"]} />     // photos only
import { useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, type JSX, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { Button } from "~/components/ui/button";
import { inputClass } from "~/components/ui/input";
import {
  ACCEPT_ATTR,
  ATTACHMENT_KINDS,
  type AttachmentKind,
  MAX_FILE_BYTES,
} from "~/lib/attachments/rules";
import { cn } from "~/lib/cn";
import { goToLogin } from "~/lib/error-text";
import { m } from "~/paraglide/messages";
import type { Level } from "~/server/authz/levels";
import type { SerializedAttachment } from "~/server/authz/serialize";
import { attachmentErrorText } from "./errors";
import { canEditAttachments, formatBytes, KIND_LABEL } from "./format";
import { attachmentsQueryKey } from "./queries";
import { downscaleForUpload, uploadFile } from "./upload-client";

type Status = "waiting" | "preparing" | "uploading" | "processing" | "done" | "error";
type Entry = {
  id: number;
  file: File;
  kind: AttachmentKind;
  status: Status;
  progress: number;
  error?: string;
};

const PARALLEL = 2;
let nextId = 1;

export function AttachmentUploader(props: {
  itemId: string;
  /** The caller's level on the item; renders nothing below `edit`. */
  level: Level;
  /** Kinds to offer (default: all). The first is preselected unless `defaultKind`. */
  kinds?: readonly AttachmentKind[];
  defaultKind?: AttachmentKind;
  onUploaded?: (a: SerializedAttachment) => void;
  class?: string;
}) {
  const qc = useQueryClient();
  const kinds = () => props.kinds ?? ATTACHMENT_KINDS;
  const [kind, setKind] = createSignal<AttachmentKind>(props.defaultKind ?? kinds()[0] ?? "photo");
  const [entries, setEntries] = createStore<Entry[]>([]);
  const [dragging, setDragging] = createSignal(false);
  let active = 0;

  const update = (id: number, patch: Partial<Entry>) => setEntries((e) => e.id === id, patch);

  function add(files: FileList | File[] | null) {
    if (!files) return;
    const k = kind();
    const list = [...files].map<Entry>((file) => ({
      id: nextId++,
      file,
      kind: k,
      status: "waiting",
      progress: 0,
    }));
    setEntries(produce((e) => e.push(...list)));
    pump();
  }

  function pump() {
    while (active < PARALLEL) {
      const next = entries.find((e) => e.status === "waiting");
      if (!next) return;
      active++;
      update(next.id, { status: "preparing" });
      const id = next.id;
      void run(id)
        .catch(() => update(id, { status: "error", error: attachmentErrorText("SERVER") }))
        .finally(() => {
          active--;
          pump();
        });
    }
  }

  async function run(id: number) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const file = await downscaleForUpload(entry.file, entry.kind);
    if (file.size > MAX_FILE_BYTES) {
      update(id, { status: "error", error: attachmentErrorText("ATTACHMENTS_TOO_LARGE") });
      return;
    }
    update(id, { status: "uploading", progress: 0 });
    const r = await uploadFile(props.itemId, entry.kind, file, (p) =>
      update(id, p >= 1 ? { status: "processing", progress: 1 } : { progress: p }),
    );
    if (r.ok) {
      update(id, { status: "done", progress: 1 });
      await qc.invalidateQueries({ queryKey: attachmentsQueryKey(props.itemId) });
      props.onUploaded?.(r.attachment);
      setTimeout(() => setEntries((e) => e.filter((x) => x.id !== id)), 2500);
      return;
    }
    if (r.code === "Not authenticated") {
      goToLogin();
      return;
    }
    update(id, { status: "error", error: attachmentErrorText(r.code) });
  }

  function retry(id: number) {
    update(id, { status: "waiting", progress: 0, error: undefined });
    pump();
  }

  const dismiss = (id: number) => setEntries((e) => e.filter((x) => x.id !== id));

  const onDrop: JSX.EventHandler<HTMLDivElement, DragEvent> = (e) => {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer?.files ?? null);
  };

  const statusText = (e: Entry) => {
    switch (e.status) {
      case "waiting":
        return m.attachments_status_waiting();
      case "preparing":
        return m.attachments_status_preparing();
      case "uploading":
        return m.attachments_status_uploading({ percent: Math.round(e.progress * 100) });
      case "processing":
        return m.attachments_status_processing();
      case "done":
        return m.attachments_status_done();
      default:
        return e.error ?? "";
    }
  };

  let cameraInput!: HTMLInputElement;
  let fileInput!: HTMLInputElement;

  return (
    <Show when={canEditAttachments(props.level)}>
      <div class={cn("grid gap-3", props.class)} data-testid="attachment-uploader">
        <Show when={kinds().length > 1}>
          <label class="grid gap-1 text-sm font-medium">
            {m.attachments_upload_as()}
            <select
              class={inputClass}
              value={kind()}
              onChange={(e) => setKind(e.currentTarget.value as AttachmentKind)}
            >
              <For each={kinds()}>{(k) => <option value={k}>{KIND_LABEL[k]()}</option>}</For>
            </select>
          </label>
        </Show>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target only; the buttons inside are the accessible way in */}
        <div
          class={cn(
            "grid gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors",
            dragging() ? "border-primary bg-accent" : "border-input",
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <div class="flex flex-wrap justify-center gap-2">
            <Show when={kind() !== "manual"}>
              <Button type="button" onClick={() => cameraInput.click()}>
                {m.attachments_take_photo()}
              </Button>
            </Show>
            <Button type="button" variant="outline" onClick={() => fileInput.click()}>
              {m.attachments_pick_files()}
            </Button>
          </div>
          <p class="hidden text-sm text-muted-foreground sm:block">
            {dragging() ? m.attachments_drop_now() : m.attachments_drop_hint()}
          </p>
          <p class="text-xs text-muted-foreground">{m.attachments_limits_hint()}</p>
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            class="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="attachment-camera-input"
            onChange={(e) => {
              add(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT_ATTR[kind()]}
            class="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="attachment-file-input"
            onChange={(e) => {
              add(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
          />
        </div>
        <Show when={entries.length > 0}>
          <ul class="grid gap-2" aria-label={m.attachments_queue_label()} aria-live="polite">
            <For each={entries}>
              {(e) => (
                <li
                  class={cn(
                    "grid gap-1 rounded-md border p-2 text-sm",
                    e.status === "error" && "border-destructive",
                  )}
                  data-status={e.status}
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate font-medium">
                      {e.file.name || m.attachments_unnamed()}
                    </span>
                    <span class="shrink-0 text-xs text-muted-foreground">
                      {KIND_LABEL[e.kind]()} · {formatBytes(e.file.size)}
                    </span>
                  </div>
                  <Show
                    when={e.status !== "error"}
                    fallback={
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="text-destructive" role="alert">
                          {e.error}
                        </span>
                        <span class="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => retry(e.id)}>
                            {m.attachments_retry()}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={m.attachments_dismiss()}
                            onClick={() => dismiss(e.id)}
                          >
                            ✕
                          </Button>
                        </span>
                      </div>
                    }
                  >
                    <div
                      class="h-1.5 overflow-hidden rounded bg-secondary"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(e.progress * 100)}
                    >
                      <div
                        class={cn(
                          "h-full bg-primary transition-[width]",
                          e.status === "processing" && "animate-pulse",
                        )}
                        style={{ width: `${Math.round(e.progress * 100)}%` }}
                      />
                    </div>
                    <span class="text-xs text-muted-foreground">{statusText(e)}</span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </Show>
  );
}

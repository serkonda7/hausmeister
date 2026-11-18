// ISBN auto-fill in quick add (DESIGN §5.2): type or scan the ISBN, fetch the book data (lookupBookFn) and hand name and attribute values to the form.
// Shown for types whose ISBN field has lookup sources.
// The ISBN is checksum-validated before anything is sent.
import { Link } from "@tanstack/solid-router";
import { createEffect, createSignal, Show } from "solid-js";
import { CameraScanner, useScanSupport } from "~/components/scan/camera-scanner";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { inputClass } from "~/components/ui/input";
import { toIsbn13 } from "~/lib/isbn";
import { type BookLookupResult, SOURCE_LABEL } from "~/lib/isbn-types";
import { isValidIsbn, normalizeIsbn } from "~/lib/item-types/fields";
import { actionErrorText } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import { lookupBookFn } from "~/server/isbn/functions";

export type FoundBook = Extract<BookLookupResult, { status: "found" }>;

export function IsbnFill(props: {
  typeId: string;
  /** Prefilled ISBN (scan without a match); looked up right away. */
  initial?: string;
  onFound: (r: FoundBook) => void;
  /** Every checked ISBN (ISBN-13), found or not, so the form's ISBN field gets it too. */
  onIsbn?: (isbn13: string) => void;
  disabled?: boolean;
}) {
  const support = useScanSupport();
  const [isbn, setIsbn] = createSignal(props.initial ?? "");
  const [status, setStatus] = createSignal<{ text: string; error?: boolean }>();
  const [busy, setBusy] = createSignal(false);
  const [scanning, setScanning] = createSignal(false);

  async function run(value = isbn()) {
    const v = normalizeIsbn(value);
    if (!isValidIsbn(v)) {
      setStatus({ text: m.isbn_invalid(), error: true });
      return;
    }
    const isbn13 = toIsbn13(v);
    if (isbn13) props.onIsbn?.(isbn13);
    setBusy(true);
    setStatus({ text: m.isbn_looking_up() });
    try {
      const r = await lookupBookFn({ data: { isbn: v, typeId: props.typeId } });
      if (r.status === "found") {
        props.onFound(r);
        setStatus({
          text: m.isbn_found({
            source: SOURCE_LABEL[r.book.source],
            title: [r.book.title, r.book.authors.join(", ")].filter(Boolean).join(" – "),
          }),
        });
      } else
        setStatus({
          text: r.status === "not_found" ? m.isbn_not_found() : m.isbn_unavailable(),
          error: true,
        });
    } catch (err) {
      setStatus({ text: actionErrorText(err), error: true });
    } finally {
      setBusy(false);
    }
  }

  let started = false;
  createEffect(() => {
    if (started || !props.initial || !props.typeId) return;
    started = true;
    void run(props.initial);
  });

  return (
    <section class="grid gap-2 rounded-md border bg-muted/40 p-3" aria-labelledby="isbn-fill-h">
      <h2 id="isbn-fill-h" class="text-sm font-medium">
        {m.isbn_fill_title()}
      </h2>
      <div class="flex flex-wrap gap-2">
        <label for="isbn-fill" class="sr-only">
          {m.isbn_label()}
        </label>
        <input
          id="isbn-fill"
          class={`${inputClass} min-w-0 flex-1 font-mono`}
          inputmode="numeric"
          autocomplete="off"
          placeholder={m.isbn_placeholder()}
          value={isbn()}
          disabled={props.disabled}
          onInput={(e) => setIsbn(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          aria-describedby="isbn-fill-status"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={busy() || props.disabled}
          onClick={() => void run()}
        >
          {m.isbn_fetch()}
        </Button>
        <Show when={support() === "yes"}>
          <Button
            type="button"
            variant="outline"
            disabled={props.disabled}
            onClick={() => setScanning(true)}
          >
            {m.isbn_scan()}
          </Button>
        </Show>
      </div>
      <p
        id="isbn-fill-status"
        role="status"
        class={status()?.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      >
        {status()?.text ?? m.isbn_fill_hint()}
      </p>
      <p class="text-sm">
        <Link
          to="/items/shelf"
          search={{ type: props.typeId }}
          class="text-primary underline-offset-4 hover:underline"
        >
          {m.shelf_link_many()}
        </Link>
      </p>
      <Dialog open={scanning()} onOpenChange={setScanning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.isbn_scan()}</DialogTitle>
          </DialogHeader>
          <Show when={scanning()}>
            <CameraScanner
              paused={false}
              onCode={(raw) => {
                const v = normalizeIsbn(raw);
                if (!isValidIsbn(v)) return;
                setIsbn(v);
                setScanning(false);
                void run(v);
              }}
            />
          </Show>
        </DialogContent>
      </Dialog>
    </section>
  );
}

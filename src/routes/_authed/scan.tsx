// Scan mode (DESIGN §5.2, §9): point the camera at a QR label, an ISBN or a product barcode; the hit shows below with quick actions, and scanning goes on after "Weiter scannen".
// Without BarcodeDetector (or camera) the code field does the same; QR labels also open from the phone's camera app, because they carry the full /q/<code> URL.
// Typed ISBNs are checked first.
import { createFileRoute, Link } from "@tanstack/solid-router";
import { createSignal, Show } from "solid-js";
import { CameraScanner, useScanSupport } from "~/components/scan/camera-scanner";
import { ScanResult } from "~/components/scan/scan-result";
import { Button } from "~/components/ui/button";
import { inputClass } from "~/components/ui/input";
import { isValidIsbn, normalizeIsbn } from "~/lib/item-types/fields";
import { actionErrorText } from "~/lib/run-action";
import type { CodeLookup } from "~/lib/scan/types";
import { m } from "~/paraglide/messages";
import { lookupCodeFn } from "~/server/scan/functions";

export const Route = createFileRoute("/_authed/scan")({
  head: () => ({ meta: [{ title: `${m.scan_title()} · ${m.app_name()}` }] }),
  component: ScanPage,
});

/** Digits (and X) that look like an ISBN attempt: 10 or 13 characters, starting 97 if 13. */
const looksLikeIsbn = (s: string) => /^(97[89]\d{10}|\d{9}[\dX])$/.test(s);

function ScanPage() {
  const ctx = Route.useRouteContext();
  const support = useScanSupport();
  const [code, setCode] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [result, setResult] = createSignal<CodeLookup>();
  const [busy, setBusy] = createSignal(false);
  const canAdd = () => ctx().user.role !== "guest";

  async function lookup(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(await lookupCodeFn({ data: { code: value } }));
    } catch (err) {
      setResult(undefined);
      setError(actionErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  function onTyped(e: SubmitEvent) {
    e.preventDefault();
    const v = code().trim();
    if (!v) return;
    const isbn = normalizeIsbn(v);
    if (looksLikeIsbn(isbn) && !isValidIsbn(isbn)) {
      setResult(undefined);
      setError(m.scan_isbn_invalid());
      return;
    }
    void lookup(v);
  }

  return (
    <div class="grid gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="mr-auto text-2xl font-semibold">{m.scan_title()}</h1>
        <Show when={canAdd()}>
          <Link to="/items/shelf" class="text-sm text-primary underline-offset-4 hover:underline">
            {m.shelf_link()}
          </Link>
        </Show>
      </div>

      <Show when={support() === "yes"}>
        <CameraScanner paused={!!result() || busy()} onCode={(raw) => void lookup(raw)} />
      </Show>
      <Show when={support() === "no"}>
        <p class="rounded-md border bg-muted p-3 text-sm">{m.scan_unsupported()}</p>
      </Show>

      <Show when={error()}>
        <p role="alert" class="text-sm text-destructive">
          {error()}
        </p>
      </Show>
      <Show when={result()}>
        {(r) => (
          <>
            <ScanResult result={r()} canAdd={canAdd()} />
            <div>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  setResult(undefined);
                  setCode("");
                }}
              >
                {m.scan_next()}
              </Button>
            </div>
          </>
        )}
      </Show>

      <form class="grid gap-2" noValidate onSubmit={onTyped}>
        <label for="scan-code" class="text-sm font-medium">
          {m.scan_code_label()}
        </label>
        <div class="flex gap-2">
          <input
            id="scan-code"
            class={`${inputClass} h-12 font-mono text-lg uppercase`}
            autocomplete="off"
            autocapitalize="characters"
            enterkeyhint="search"
            value={code()}
            onInput={(e) => setCode(e.currentTarget.value)}
            aria-describedby="scan-code-hint"
          />
          <Button type="submit" size="lg" disabled={busy()}>
            {m.scan_code_submit()}
          </Button>
        </div>
        <p id="scan-code-hint" class="text-sm text-muted-foreground">
          {m.scan_code_hint()}
        </p>
      </form>
    </div>
  );
}

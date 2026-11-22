import { Toast, toaster } from "@kobalte/core/toast";
import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import { cn } from "~/lib/cn";
import { m } from "~/paraglide/messages";

/** Mount once (the root layout does). */
export function Toaster() {
  return (
    <Portal>
      <Toast.Region duration={5000} limit={3} swipeDirection="down">
        <Toast.List class="fixed inset-x-0 bottom-0 z-[100] mx-auto flex w-full max-w-md flex-col gap-2 p-4 outline-none" />
      </Toast.Region>
    </Portal>
  );
}

type ToastVariant = "default" | "success" | "error";

/** Show a toast: `showToast({ title: m.saved(), variant: "success" })`. */
export function showToast(opts: { title: string; description?: string; variant?: ToastVariant }) {
  return toaster.show((props) => (
    <Toast
      toastId={props.toastId}
      class={cn(
        "hm-animate-slide flex items-start justify-between gap-3 rounded-md border bg-background p-4 shadow-lg",
        opts.variant === "error" && "border-destructive text-destructive",
        opts.variant === "success" && "border-success",
      )}
    >
      <div class="grid gap-1">
        <Toast.Title class="text-sm font-semibold">{opts.title}</Toast.Title>
        <Show when={opts.description}>
          <Toast.Description class="text-sm opacity-90">{opts.description}</Toast.Description>
        </Show>
      </div>
      <Toast.CloseButton class="opacity-70 hover:opacity-100" aria-label={m.common_close()}>
        ✕
      </Toast.CloseButton>
    </Toast>
  ));
}

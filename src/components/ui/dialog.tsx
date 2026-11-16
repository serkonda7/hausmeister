import * as DialogPrimitive from "@kobalte/core/dialog";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { type ComponentProps, type JSX, splitProps, type ValidComponent } from "solid-js";
import { cn } from "~/lib/cn";
import { m } from "~/paraglide/messages";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogCloseButton = DialogPrimitive.CloseButton;

type ContentProps<T extends ValidComponent = "div"> = DialogPrimitive.DialogContentProps<T> & {
  class?: string;
  children?: JSX.Element;
};

/** Bottom sheet on phones, centered dialog from `sm` up. */
export function DialogContent<T extends ValidComponent = "div">(
  props: PolymorphicProps<T, ContentProps<T>>,
) {
  const [local, others] = splitProps(props as ContentProps, ["class", "children"]);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay class="hm-animate-fade fixed inset-0 z-50 bg-black/50" />
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <DialogPrimitive.Content
          class={cn(
            "hm-animate-zoom relative grid max-h-[90dvh] w-full gap-4 overflow-y-auto rounded-t-xl border bg-background p-5 shadow-lg sm:max-w-lg sm:rounded-xl",
            local.class,
          )}
          {...others}
        >
          {local.children}
          <DialogPrimitive.CloseButton
            class="absolute right-3 top-3 flex size-9 items-center justify-center rounded-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={m.common_close()}
          >
            ✕
          </DialogPrimitive.CloseButton>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader(props: ComponentProps<"div">) {
  const [local, others] = splitProps(props, ["class"]);
  return <div class={cn("flex flex-col gap-1.5 pr-8", local.class)} {...others} />;
}

export function DialogFooter(props: ComponentProps<"div">) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div
      class={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", local.class)}
      {...others}
    />
  );
}

type TitleProps<T extends ValidComponent = "h2"> = DialogPrimitive.DialogTitleProps<T> & {
  class?: string;
};
export function DialogTitle<T extends ValidComponent = "h2">(
  props: PolymorphicProps<T, TitleProps<T>>,
) {
  const [local, others] = splitProps(props as TitleProps, ["class"]);
  return <DialogPrimitive.Title class={cn("text-lg font-semibold", local.class)} {...others} />;
}

type DescriptionProps<T extends ValidComponent = "p"> =
  DialogPrimitive.DialogDescriptionProps<T> & { class?: string };
export function DialogDescription<T extends ValidComponent = "p">(
  props: PolymorphicProps<T, DescriptionProps<T>>,
) {
  const [local, others] = splitProps(props as DescriptionProps, ["class"]);
  return (
    <DialogPrimitive.Description
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    />
  );
}

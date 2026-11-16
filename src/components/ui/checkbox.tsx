import * as CheckboxPrimitive from "@kobalte/core/checkbox";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { type JSX, Show, splitProps, type ValidComponent } from "solid-js";
import { cn } from "~/lib/cn";

type CheckboxProps<T extends ValidComponent = "div"> = CheckboxPrimitive.CheckboxRootProps<T> & {
  class?: string;
  label?: JSX.Element;
};

/** Checkbox with an optional label; the whole row is the touch target. */
export function Checkbox<T extends ValidComponent = "div">(
  props: PolymorphicProps<T, CheckboxProps<T>>,
) {
  const [local, others] = splitProps(props as CheckboxProps, ["class", "label"]);
  return (
    <CheckboxPrimitive.Root class={cn("flex items-center gap-2", local.class)} {...others}>
      <CheckboxPrimitive.Input class="peer" />
      <CheckboxPrimitive.Control class="flex size-5 shrink-0 items-center justify-center rounded-sm border border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 data-[checked]:bg-primary data-[checked]:text-primary-foreground data-[disabled]:opacity-50">
        <CheckboxPrimitive.Indicator>
          <svg
            viewBox="0 0 24 24"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            aria-hidden="true"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Control>
      <Show when={local.label}>
        <CheckboxPrimitive.Label class="text-sm">{local.label}</CheckboxPrimitive.Label>
      </Show>
    </CheckboxPrimitive.Root>
  );
}

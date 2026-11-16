import { type ComponentProps, splitProps } from "solid-js";
import { cn } from "~/lib/cn";

export function Textarea(props: ComponentProps<"textarea">) {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <textarea
      class={cn(
        "flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        local.class,
      )}
      {...others}
    />
  );
}

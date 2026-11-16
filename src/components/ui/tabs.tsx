import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TabsPrimitive from "@kobalte/core/tabs";
import { splitProps, type ValidComponent } from "solid-js";
import { cn } from "~/lib/cn";

export const Tabs = TabsPrimitive.Root;

type ListProps<T extends ValidComponent = "div"> = TabsPrimitive.TabsListProps<T> & {
  class?: string;
};
export function TabsList<T extends ValidComponent = "div">(
  props: PolymorphicProps<T, ListProps<T>>,
) {
  const [local, others] = splitProps(props as ListProps, ["class"]);
  return (
    <TabsPrimitive.List
      class={cn(
        "inline-flex h-11 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        local.class,
      )}
      {...others}
    />
  );
}

type TriggerProps<T extends ValidComponent = "button"> = TabsPrimitive.TabsTriggerProps<T> & {
  class?: string;
};
export function TabsTrigger<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, TriggerProps<T>>,
) {
  const [local, others] = splitProps(props as TriggerProps, ["class"]);
  return (
    <TabsPrimitive.Trigger
      class={cn(
        "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-sm px-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm",
        local.class,
      )}
      {...others}
    />
  );
}

type ContentProps<T extends ValidComponent = "div"> = TabsPrimitive.TabsContentProps<T> & {
  class?: string;
};
export function TabsContent<T extends ValidComponent = "div">(
  props: PolymorphicProps<T, ContentProps<T>>,
) {
  const [local, others] = splitProps(props as ContentProps, ["class"]);
  return (
    <TabsPrimitive.Content
      class={cn(
        "mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        local.class,
      )}
      {...others}
    />
  );
}

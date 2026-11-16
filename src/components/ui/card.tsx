import { type ComponentProps, splitProps } from "solid-js";
import { cn } from "~/lib/cn";

const make = (base: string) => (props: ComponentProps<"div">) => {
  const [local, others] = splitProps(props, ["class"]);
  return <div class={cn(base, local.class)} {...others} />;
};

export const Card = make("rounded-lg border bg-card text-card-foreground shadow-sm");
export const CardHeader = make("flex flex-col gap-1.5 p-4");
export const CardTitle = make("text-lg font-semibold leading-none tracking-tight");
export const CardDescription = make("text-sm text-muted-foreground");
export const CardContent = make("p-4 pt-0");
export const CardFooter = make("flex items-center p-4 pt-0");

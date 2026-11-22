import { createFileRoute, redirect } from "@tanstack/solid-router";
import { sectionsFor } from "~/lib/admin-sections";

// /admin opens the first section the user may see.
export const Route = createFileRoute("/_authed/admin/")({
  beforeLoad: ({ context }) => {
    const first = sectionsFor(context.user.role)[0];
    if (first) throw redirect({ to: first.to as "/" });
  },
});

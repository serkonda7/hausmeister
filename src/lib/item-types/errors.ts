// Maps ItemTypeError codes ("CODE" or "CODE:detail", see server/item-types/service.ts)
// from a failed server-function call to German text.
import { m } from "~/paraglide/messages";

export function itemTypeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const i = raw.indexOf(":");
  const code = i === -1 ? raw : raw.slice(0, i);
  const detail = i === -1 ? "" : raw.slice(i + 1);
  switch (code) {
    case "NOT_FOUND":
      return m.types_error_not_found();
    case "FORBIDDEN":
      return m.types_error_forbidden();
    case "NOT_CREATOR":
      return m.types_readonly_not_creator();
    case "IN_USE_BY_OTHERS":
      return m.types_readonly_in_use();
    case "HAS_ITEMS":
      return m.types_error_has_items();
    case "HAS_CHILDREN":
      return m.types_error_has_children();
    case "KEY_TAKEN":
      return m.types_error_key_taken();
    case "KEY_COLLISION":
      return m.types_error_key_collision({ key: detail });
    case "CYCLE":
      return m.types_error_cycle();
    case "PARENT_NOT_FOUND":
      return m.types_error_parent();
    case "INVALID":
      return m.types_error_invalid({ detail });
    default:
      return m.error_generic();
  }
}

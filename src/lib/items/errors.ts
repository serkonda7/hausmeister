// Error codes of the items, locations, tags, search and history server
// functions, and their German text. The server throws ItemsError
// (src/server/items/errors.ts) whose message is "CODE" or "CODE:detail"; that
// survives server-function serialization. In the UI:
//   const e = parseItemsError(err)   // { code, detail, fieldErrors }
//   if (e.code === "VERSION_CONFLICT") refetch and tell the user
//   itemsErrorText(err)              // German text (falls back to errorText)
import { m } from "~/paraglide/messages";
import { errorText } from "../error-text";

export const ITEMS_ERROR_CODES = [
  "ITEM_NOT_FOUND",
  "ITEM_FORBIDDEN",
  "VERSION_CONFLICT",
  "INVALID_INPUT",
  "TYPE_NOT_FOUND",
  "TYPE_ARCHIVED",
  "ATTRIBUTES_INVALID",
  "OWNER_INVALID",
  "OWNER_NOT_ALLOWED",
  "HOUSEHOLD_PRIVATE",
  "GRANT_INVALID",
  "GRANT_ABOVE_CEILING",
  "LOCATION_NOT_FOUND",
  "LOCATION_FORBIDDEN",
  "LOCATION_CYCLE",
  "LOCATION_NOT_EMPTY",
  "LOCATION_NAME_TAKEN",
  "CONTAINER_NOT_FOUND",
  "CONTAINER_CYCLE",
  "TAG_NOT_FOUND",
  "TAG_NAME_TAKEN",
  "TAG_FORBIDDEN",
  "TAG_MERGE_SELF",
  "SEARCH_ATTRIBUTE_UNKNOWN",
  "SEARCH_ATTRIBUTE_NEEDS_TYPE",
  "CURSOR_INVALID",
  "SHORT_CODE_NOT_FOUND",
  "STOCK_NEGATIVE",
] as const;
export type ItemsErrorCode = (typeof ITEMS_ERROR_CODES)[number];

export type ParsedItemsError = {
  code: ItemsErrorCode | null;
  detail: string;
  /** ATTRIBUTES_INVALID: attribute key -> German message (for the form). */
  fieldErrors: Record<string, string>;
};

export function parseItemsError(err: unknown): ParsedItemsError {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const i = raw.indexOf(":");
  const head = i === -1 ? raw : raw.slice(0, i);
  const detail = i === -1 ? "" : raw.slice(i + 1);
  const code = (ITEMS_ERROR_CODES as readonly string[]).includes(head)
    ? (head as ItemsErrorCode)
    : null;
  let fieldErrors: Record<string, string> = {};
  if (code === "ATTRIBUTES_INVALID" && detail) {
    try {
      const parsed = JSON.parse(detail) as unknown;
      if (parsed && typeof parsed === "object") fieldErrors = parsed as Record<string, string>;
    } catch {
      // not JSON: no field errors
    }
  }
  return { code, detail, fieldErrors };
}

/** PrincipalError details of OWNER_INVALID / GRANT_INVALID. */
function principalText(detail: string): string {
  switch (detail) {
    case "USER_NOT_FOUND":
      return m.items_error_principal_user_not_found();
    case "USER_DISABLED":
      return m.items_error_principal_user_disabled();
    case "USER_IS_GUEST":
      return m.items_error_principal_user_guest();
    case "GROUP_NOT_FOUND":
      return m.items_error_principal_group_not_found();
    default:
      return m.items_error_principal_invalid();
  }
}

export function itemsErrorText(err: unknown): string {
  const { code, detail } = parseItemsError(err);
  switch (code) {
    case "ITEM_NOT_FOUND":
      return m.items_error_not_found();
    case "ITEM_FORBIDDEN":
      return m.items_error_forbidden();
    case "VERSION_CONFLICT":
      return m.items_error_version_conflict();
    case "INVALID_INPUT":
      return m.items_error_invalid_input();
    case "TYPE_NOT_FOUND":
      return m.items_error_type_not_found();
    case "TYPE_ARCHIVED":
      return m.items_error_type_archived();
    case "ATTRIBUTES_INVALID":
      return m.items_error_attributes_invalid();
    case "OWNER_INVALID":
    case "GRANT_INVALID":
      return principalText(detail);
    case "OWNER_NOT_ALLOWED":
      return m.items_error_owner_not_allowed();
    case "HOUSEHOLD_PRIVATE":
      return m.items_error_household_private();
    case "GRANT_ABOVE_CEILING":
      return m.items_error_grant_above_ceiling();
    case "LOCATION_NOT_FOUND":
      return m.locations_error_not_found();
    case "LOCATION_FORBIDDEN":
      return m.locations_error_forbidden();
    case "LOCATION_CYCLE":
      return m.locations_error_cycle();
    case "LOCATION_NOT_EMPTY":
      return m.locations_error_not_empty();
    case "LOCATION_NAME_TAKEN":
      return m.locations_error_name_taken();
    case "CONTAINER_NOT_FOUND":
      return m.items_error_container_not_found();
    case "CONTAINER_CYCLE":
      return m.items_error_container_cycle();
    case "TAG_NOT_FOUND":
      return m.tags_error_not_found();
    case "TAG_NAME_TAKEN":
      return m.tags_error_name_taken();
    case "TAG_FORBIDDEN":
      return m.tags_error_forbidden();
    case "TAG_MERGE_SELF":
      return m.tags_error_merge_self();
    case "SEARCH_ATTRIBUTE_UNKNOWN":
    case "SEARCH_ATTRIBUTE_NEEDS_TYPE":
      return m.search_error_attribute();
    case "CURSOR_INVALID":
      return m.search_error_cursor();
    case "SHORT_CODE_NOT_FOUND":
      return m.search_error_short_code();
    case "STOCK_NEGATIVE":
      return m.stock_error_negative();
    default:
      return errorText(err);
  }
}

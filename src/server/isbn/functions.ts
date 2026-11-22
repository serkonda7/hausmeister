// Server function for the ISBN auto-fill. Logic: ./service.ts, ./lookup.ts.
import { createServerFn } from "@tanstack/solid-start";
import { authMiddleware } from "../auth/middleware";
import { itemsDb } from "../search/ready";
import { lookupBook, lookupBookInput } from "./service";

/** Admin/member. BookLookupResult: found (with name and attributes for the type), not_found, unavailable. */
export const lookupBookFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(lookupBookInput)
  .handler(({ context: { ctx }, data }) => lookupBook(itemsDb(), ctx, data));

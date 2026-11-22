// Server functions for locations (rights: see ./service.ts).
import { createServerFn } from "@tanstack/solid-start";
import { z } from "zod";
import {
  createLocationInput,
  idSchema,
  moveLocationInput,
  updateLocationInput,
} from "~/lib/items/inputs";
import { authMiddleware } from "../auth/middleware";
import { itemsDb } from "../search/ready";
import {
  createLocation,
  deleteLocation,
  getLocation,
  listLocations,
  moveLocation,
  updateLocation,
} from "./service";

/** LocationNode[] (tree with visible item counts). */
export const listLocationsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context: { ctx } }) => listLocations(itemsDb(), ctx));

/** LocationDetail (path, children, rights). Items: searchItemsFn({ locationId, locationScope: "direct" }). */
export const getLocationFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: idSchema }))
  .handler(({ context: { ctx }, data }) => getLocation(itemsDb(), ctx, data.id));

export const createLocationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createLocationInput)
  .handler(({ context: { ctx }, data }) => createLocation(itemsDb(), ctx, data));

export const updateLocationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateLocationInput)
  .handler(({ context: { ctx }, data }) => {
    updateLocation(itemsDb(), ctx, data);
    return { ok: true as const };
  });

export const moveLocationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(moveLocationInput)
  .handler(({ context: { ctx }, data }) => {
    moveLocation(itemsDb(), ctx, data);
    return { ok: true as const };
  });

/** Returns { movedItems, movedLocations } (admins: contents move up a level). */
export const deleteLocationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: idSchema }))
  .handler(({ context: { ctx }, data }) => deleteLocation(itemsDb(), ctx, data));

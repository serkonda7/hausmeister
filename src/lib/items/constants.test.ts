import { expect, test } from "bun:test";
import * as schema from "../../server/db/schema";
import * as c from "./constants";

test("enum constants match the schema", () => {
  expect([...c.ITEM_STATUSES]).toEqual([...schema.ITEM_STATUSES]);
  expect([...c.OWNER_KINDS]).toEqual([...schema.OWNER_KINDS]);
  expect([...c.VISIBILITIES]).toEqual([...schema.VISIBILITIES]);
  expect([...c.GRANT_LEVELS]).toEqual([...schema.GRANT_LEVELS]);
  expect([...c.PRINCIPAL_KINDS]).toEqual([...schema.PRINCIPAL_KINDS]);
  expect([...c.STOCK_REASONS]).toEqual([...schema.STOCK_REASONS]);
  expect([...c.ITEM_RELATION_KINDS]).toEqual([...schema.ITEM_RELATION_KINDS]);
  for (const s of c.GONE_STATUSES) expect(c.ITEM_STATUSES).toContain(s);
});

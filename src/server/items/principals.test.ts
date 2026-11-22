import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { listPrincipals } from "./principals";
import { setupFixture } from "./test-fixtures";

describe("listPrincipals", () => {
  test("lists active users (guests included) and groups with membership", () => {
    const f = setupFixture();
    const r = listPrincipals(f.db, f.ben);
    expect(r.users.map((u) => u.displayName)).toEqual(["Admin", "Anna", "Ben", "Gast"]);
    expect(r.users.find((u) => u.displayName === "Gast")?.role).toBe("guest");
    expect(r.groups).toEqual([{ id: f.group.id, name: "Kinder", member: true }]);
    expect(listPrincipals(f.db, f.anna).groups[0]?.member).toBe(false);
  });

  test("leaves disabled users out", () => {
    const f = setupFixture();
    f.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, f.anna.userId)).run();
    expect(listPrincipals(f.db, f.admin).users.map((u) => u.displayName)).not.toContain("Anna");
  });

  test("guests get ITEM_FORBIDDEN", () => {
    const f = setupFixture();
    expect(() => listPrincipals(f.db, f.gast)).toThrow("ITEM_FORBIDDEN");
  });
});

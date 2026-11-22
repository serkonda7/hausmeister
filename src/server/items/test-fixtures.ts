// Test-only fixture for the items, locations, tags, search and history tests:
// an in-memory DB with four users, a group and a small type tree.
import type { FieldDefinition } from "../../lib/item-types/fields";
import type { CreateItemInput } from "../../lib/items/inputs";
import type { AuthCtx, Role } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { groupMembers, groups, users } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { createItemType } from "../item-types/service";
import { createItem } from "./service";

export const TOOL_FIELDS: FieldDefinition[] = [
  { key: "brand", label: "Marke", kind: "text" },
  { key: "voltage", label: "Spannung", kind: "integer" },
  { key: "season", label: "Saison", kind: "select", options: ["Sommer", "Winter"] },
  { key: "size", label: "Größe", kind: "size", systems: ["child"] },
  { key: "fits", label: "Passt zu", kind: "item", multiple: true },
  { key: "keeper", label: "Hüter", kind: "user" },
  { key: "colors", label: "Farben", kind: "multiselect", options: ["rot", "blau"] },
  { key: "cordless", label: "Kabellos", kind: "boolean" },
];

export type Fixture = ReturnType<typeof setupFixture>;

export function setupFixture() {
  const db: AppDb = createTestDb();
  const mk = (username: string, role: Role, displayName = username): AuthCtx => {
    const u = db
      .insert(users)
      .values({ username, displayName, authEmail: `${username}@users.invalid`, role })
      .returning()
      .get();
    return { userId: u.id, role, groupIds: new Set() };
  };
  const admin = mk("admin", "admin", "Admin");
  const anna = mk("anna", "member", "Anna");
  const ben = mk("ben", "member", "Ben");
  const gast = mk("gast", "guest", "Gast");
  const group = db.insert(groups).values({ name: "Kinder" }).returning().get();
  db.insert(groupMembers).values({ groupId: group.id, userId: ben.userId }).run();
  ben.groupIds.add(group.id);

  const tool = createItemType(db, admin, {
    key: "tool",
    name: "Werkzeug",
    icon: null,
    tracking: "individual",
    parentId: null,
    fields: TOOL_FIELDS,
  });
  const power = createItemType(db, admin, {
    key: "power_tool",
    name: "Elektrowerkzeug",
    icon: null,
    tracking: "individual",
    parentId: tool.id,
    fields: [
      { key: "battery", label: "Akkusystem", kind: "select", options: ["Bosch 18V", "Makita"] },
    ],
  });
  const other = createItemType(db, admin, {
    key: "other",
    name: "Sonstiges",
    icon: null,
    tracking: "stock",
    parentId: null,
    fields: [{ key: "shop", label: "Laden", kind: "text", required: true }],
  });

  const item = (ctx: AuthCtx, input: Partial<CreateItemInput> & { name: string }) =>
    createItem(db, ctx, { typeId: tool.id, ...input });

  return { db, admin, anna, ben, gast, group, tool, power, other, item };
}

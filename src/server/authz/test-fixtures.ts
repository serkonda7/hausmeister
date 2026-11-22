// Test-only helpers: insert raw rows (including anomalies the app would never
// write, such as a guest owner or a grant to a deleted principal) without
// password hashing. App code creates users only via createUserWithPassword.
import type { AppDb } from "../db/client";
import {
  attachments,
  groupMembers,
  groups,
  itemGrants,
  items,
  itemTypes,
  type NewAttachment,
  type NewItem,
  type NewItemGrant,
  users,
} from "../db/schema";
import type { Role } from "./ctx";

export const TEST_TYPE_ID = "type-test";

export type Seed = {
  users?: { id: string; role: Role; disabled?: boolean }[];
  groups?: string[];
  members?: [groupId: string, userId: string][];
  items?: Omit<NewItem, "typeId" | "name">[];
  grants?: NewItemGrant[];
  attachments?: Omit<NewAttachment, "sha256" | "mime" | "bytes">[];
};

export function seed(db: AppDb, s: Seed) {
  db.transaction((tx) => {
    tx.insert(itemTypes)
      .values({ id: TEST_TYPE_ID, key: "test", name: "Test" })
      .onConflictDoNothing()
      .run();
    for (const u of s.users ?? []) {
      tx.insert(users)
        .values({
          id: u.id,
          username: `user-${u.id}`,
          displayName: u.id,
          authEmail: `${u.id}@users.invalid`,
          role: u.role,
          disabledAt: u.disabled ? new Date() : null,
        })
        .run();
    }
    for (const g of s.groups ?? [])
      tx.insert(groups)
        .values({ id: g, name: `group-${g}` })
        .run();
    for (const [groupId, userId] of s.members ?? [])
      tx.insert(groupMembers).values({ groupId, userId }).run();
    for (const it of s.items ?? [])
      tx.insert(items)
        .values({ name: `item-${it.id}`, typeId: TEST_TYPE_ID, ...it })
        .run();
    for (const g of s.grants ?? []) tx.insert(itemGrants).values(g).run();
    for (const a of s.attachments ?? [])
      tx.insert(attachments)
        .values({ sha256: "0".repeat(64), mime: "image/jpeg", bytes: 1, ...a })
        .run();
  });
}

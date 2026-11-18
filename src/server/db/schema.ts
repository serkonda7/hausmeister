// Drizzle schema (DESIGN §6). After editing, run `bun run db:generate`
// and commit the generated SQL in ./drizzle. Timestamps are integer milliseconds
// (Drizzle `timestamp_ms` -> Date); calendar dates (acquired_on) are 'YYYY-MM-DD' text.
// The FTS5 table `items_fts` lives in a hand-written migration (see drizzle/), not here.
import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const ROLES = ["admin", "member", "guest"] as const;
export const OWNER_KINDS = ["household", "user", "group"] as const;
export const VISIBILITIES = ["household", "private"] as const;
export const TRACKING_MODES = ["individual", "stock"] as const;
export const GRANT_LEVELS = ["view", "use", "edit", "manage"] as const;
export const PRINCIPAL_KINDS = ["user", "group"] as const;
export const ATTACHMENT_KINDS = ["photo", "receipt", "manual", "other"] as const;
export const ITEM_STATUSES = [
  "available",
  "in_use",
  "on_loan",
  "needs_repair",
  "lost",
  "outgrown",
  "archived",
  "given_away",
  "sold",
  "disposed",
] as const;
/** Why a stock quantity changed (stock_moves.reason). */
export const STOCK_REASONS = ["used", "restocked", "counted", "edited", "other"] as const;

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
const inList = (col: string, values: readonly string[]) =>
  sql.raw(`${col} IN (${values.map((v) => `'${v}'`).join(",")})`);

// --- Server -----------------------------------------------------------------
/** One row per server start. deploy/restore-test.sh compares its count. */
export const boots = sqliteTable("boots", {
  id: integer("id").primaryKey(),
  at: text("at").notNull(),
});

// --- Identity ---------------------------------------------------------------
export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    householdName: text("household_name").notNull().default("Unser Haushalt"),
    currency: text("currency").notNull().default("EUR"),
    locale: text("locale").notNull().default("de-DE"),
  },
  () => [check("settings_singleton", sql`id = 1`)],
);

/**
 * Users. Shared with Better Auth (model "user", plural "users"):
 *  - Better Auth's required `email` is mapped to `auth_email`, an internal,
 *    synthetic unique value (`<id>@users.invalid`). The real, optional address
 *    is `email` (nullable, unique), which Better Auth never touches.
 *  - Better Auth's `name` is mapped to `display_name`.
 *  - `username` / `display_username` come from the username plugin.
 */
export const users = sqliteTable(
  "users",
  {
    id: id(),
    username: text("username").notNull().unique(),
    displayUsername: text("display_username"),
    displayName: text("display_name").notNull(),
    authEmail: text("auth_email").notNull().unique(),
    email: text("email").unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    role: text("role", { enum: ROLES }).notNull().default("member"),
    locale: text("locale").notNull().default("de-DE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    disabledAt: integer("disabled_at", { mode: "timestamp_ms" }),
  },
  () => [check("users_role", inList("role", ROLES))],
);

// Better Auth owns sessions, accounts (password hash), verifications and passkeys.
export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const passkeys = sqliteTable(
  "passkeys",
  {
    id: id(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    aaguid: text("aaguid"),
  },
  (t) => [
    index("passkeys_user_idx").on(t.userId),
    index("passkeys_credential_idx").on(t.credentialID),
  ],
);

export const groups = sqliteTable("groups", {
  id: id(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("group_members_user_idx").on(t.userId),
  ],
);

export const invites = sqliteTable(
  "invites",
  {
    id: id(),
    role: text("role", { enum: ROLES }).notNull(),
    /** SHA-256 of the invite token; the token itself is only in the link. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    acceptedBy: text("accepted_by").references(() => users.id, { onDelete: "set null" }),
  },
  () => [check("invites_role", inList("role", ROLES))],
);

// --- Catalog ----------------------------------------------------------------
export const itemTypes = sqliteTable(
  "item_types",
  {
    id: id(),
    parentId: text("parent_id").references((): AnySQLiteColumn => itemTypes.id, {
      onDelete: "restrict",
    }),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    icon: text("icon"),
    tracking: text("tracking", { enum: TRACKING_MODES }).notNull().default("individual"),
    /** Field definitions (DESIGN §4.3); shape is owned by the item-type module. */
    fields: text("fields", { mode: "json" }).$type<unknown[]>().notNull().default(sql`'[]'`),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("item_types_parent_idx").on(t.parentId),
    check("item_types_tracking", inList("tracking", TRACKING_MODES)),
  ],
);

export const locations = sqliteTable(
  "locations",
  {
    id: id(),
    parentId: text("parent_id").references((): AnySQLiteColumn => locations.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    kind: text("kind"),
    shortCode: text("short_code").unique(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("locations_parent_idx").on(t.parentId)],
);

export const items = sqliteTable(
  "items",
  {
    /** UUIDv7 (Bun.randomUUIDv7()). */
    id: id(),
    typeId: text("type_id")
      .notNull()
      .references(() => itemTypes.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** normalizeSearchText(name): sort key and short-query prefix match; kept by the items module. */
    nameSort: text("name_sort"),
    description: text("description"),
    ownerKind: text("owner_kind", { enum: OWNER_KINDS }).notNull().default("household"),
    /** users.id or groups.id depending on owner_kind; NULL for household. */
    ownerId: text("owner_id"),
    visibility: text("visibility", { enum: VISIBILITIES }).notNull().default("household"),
    locationId: text("location_id").references(() => locations.id, { onDelete: "set null" }),
    containerItemId: text("container_item_id").references((): AnySQLiteColumn => items.id, {
      onDelete: "set null",
    }),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit"),
    minQuantity: real("min_quantity"),
    status: text("status", { enum: ITEM_STATUSES }).notNull().default("available"),
    condition: text("condition"),
    /** 'YYYY-MM-DD' */
    acquiredOn: text("acquired_on"),
    priceCents: integer("price_cents"),
    currency: text("currency"),
    barcode: text("barcode"),
    shortCode: text("short_code").unique(),
    attributes: text("attributes", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Optimistic locking: every edit sends the version it read. */
    version: integer("version").notNull().default(1),
  },
  (t) => [
    index("items_owner_idx").on(t.ownerKind, t.ownerId),
    index("items_type_idx").on(t.typeId),
    index("items_location_idx").on(t.locationId),
    index("items_container_idx").on(t.containerItemId),
    index("items_barcode_idx").on(t.barcode),
    index("items_name_sort_idx").on(t.nameSort, t.id),
    index("items_updated_idx").on(t.updatedAt, t.id),
    index("items_status_idx").on(t.status),
    check("items_owner_kind", inList("owner_kind", OWNER_KINDS)),
    check("items_visibility", inList("visibility", VISIBILITIES)),
    check("items_status", inList("status", ITEM_STATUSES)),
    check(
      "items_owner_id",
      sql`(owner_kind = 'household' AND owner_id IS NULL) OR (owner_kind <> 'household' AND owner_id IS NOT NULL)`,
    ),
  ],
);

export const itemGrants = sqliteTable(
  "item_grants",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    principalKind: text("principal_kind", { enum: PRINCIPAL_KINDS }).notNull(),
    principalId: text("principal_id").notNull(),
    level: text("level", { enum: GRANT_LEVELS }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.principalKind, t.principalId] }),
    index("item_grants_principal_idx").on(t.principalKind, t.principalId),
    check("item_grants_principal_kind", inList("principal_kind", PRINCIPAL_KINDS)),
    check("item_grants_level", inList("level", GRANT_LEVELS)),
  ],
);

export const tags = sqliteTable("tags", {
  id: id(),
  name: text("name").notNull().unique(),
  color: text("color"),
});

export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] }), index("item_tags_tag_idx").on(t.tagId)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: id(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ATTACHMENT_KINDS }).notNull(),
    /** Content address; file lives at UPLOAD_DIR/ab/cd/<sha256>. */
    sha256: text("sha256").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    originalName: text("original_name"),
    sort: integer("sort").notNull().default(0),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("attachments_item_idx").on(t.itemId, t.sort),
    index("attachments_sha_idx").on(t.sha256),
    check("attachments_kind", inList("kind", ATTACHMENT_KINDS)),
  ],
);

// --- Activity ---------------------------------------------------------------
/** Event log. No FK on item_id/actor_id on purpose: history outlives deletions. */
export const events = sqliteTable(
  "events",
  {
    id: id(),
    itemId: text("item_id"),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    diff: text("diff", { mode: "json" }).$type<unknown>(),
    at: integer("at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("events_item_idx").on(t.itemId, t.at), index("events_at_idx").on(t.at)],
);

/**
 * Stock changes of an item (DESIGN §4.2 `stock`): one row per adjustment or
 * quantity edit, with the quantity it left. Events carry the same change for
 * the history; this table is the stock ledger.
 */
export const stockMoves = sqliteTable(
  "stock_moves",
  {
    id: id(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    delta: real("delta").notNull(),
    quantityAfter: real("quantity_after").notNull(),
    reason: text("reason", { enum: STOCK_REASONS }).notNull(),
    note: text("note"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    at: integer("at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("stock_moves_item_idx").on(t.itemId, t.at),
    check("stock_moves_reason", inList("reason", STOCK_REASONS)),
  ],
);

/**
 * A user's in-app inbox (low stock, loan requests and answers, transfers).
 * No FK on item_id, like events: a notice may outlive its item. The payload
 * holds display data (names at the time); item names are read live and only
 * when the user can still see the item.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    itemId: text("item_id"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    index("notifications_item_idx").on(t.itemId, t.kind),
  ],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    kind: text("kind").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull().default(sql`'{}'`),
    runAt: integer("run_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
  },
  (t) => [index("jobs_due_idx").on(t.doneAt, t.runAt)],
);

// --- Row types --------------------------------------------------------------
export type Settings = typeof settings.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Passkey = typeof passkeys.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
export type ItemType = typeof itemTypes.$inferSelect;
export type NewItemType = typeof itemTypes.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemGrant = typeof itemGrants.$inferSelect;
export type NewItemGrant = typeof itemGrants.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type ItemTag = typeof itemTags.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type StockMove = typeof stockMoves.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type GrantLevel = (typeof GRANT_LEVELS)[number];

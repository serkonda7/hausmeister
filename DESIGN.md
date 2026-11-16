# Hausmeister: Family Asset Manager (Design)

A self-hosted web app where a family keeps track of what it owns: books, tools,
spare parts, clothes and electronics. It records **who owns each
thing**, **where it is**, **who has it right now**, and **who may do what**.

Status: design v3.2, 2026-11-10 (app on `sub.example.de`, delegated to deSEC). Decisions taken are listed in §0.

---

## 0. Decisions

| Topic         | Decision                                                                                                                                                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenancy       | **One household** per instance. No multi-tenancy in the data model.                                                                                                                                                                                                                                                    |
| Roles         | No separate child/adult roles. There are three roles: `admin`, `member`, `guest`.                                                                                                                                                                                                                                      |
| Network       | **VPN-only** access through **hosted Tailscale** (5 people, ~10 devices, within the free Personal plan), reached through **your own domain** with a valid TLS certificate.                                                                                                                                             |
| Domain        | The app runs on **`sub.example.de`**. `example.de` stays at **Strato** with its DNS, website and Strato mail untouched. Only the subdomain `sub` is **delegated by NS records to deSEC**, which has a DNS API for the certificate challenge (§8.1). The app subdomain sends no mail and is locked down against spoofing. |
| Email         | Optional. Reminders go out as Web Push.                                                                                                                                                                                                                                                                                |
| Private items | Admins **can** see members' private items.                                                                                                                                                                                                                                                                             |
| Money         | Prices and receipts are **hidden** from anyone who has less than `edit` on that item, which includes all guests.                                                                                                                                                                                                       |
| Language      | **German** UI only. Dates, numbers and currency use the de-DE format, € and Europe/Berlin. Code and field keys stay in English.                                                                                                                                                                                        |
| Scanning      | The browser's built-in **Barcode Detection API** only. All family phones are Android. Typing a code is the fallback (desktop).                                                                                                                                                                                         |
| Stack         | **Bun + TanStack Start** (Solid). Everything else is chosen in §7.                                                                                                                                                                                                                                                     |

---

## 1. Goals and non-goals

**Goals**

- Runs on one small VPS (1 vCPU, 1–2 GB RAM) and takes little effort to keep running.
- Nothing is exposed to the public internet; admin SSH runs over the VPN with Tailscale SSH.
- A person, a group (e.g. "Parents", "Garage crew") or the whole household can
  own an item. Roles and per-item sharing decide who can see and change it.
- Any kind of asset fits. Each item type has its own fields, and adding a new
  type needs no code change.
- Works well on a phone: you can scan a QR label on a bin, scan a book's ISBN, or
  take a photo and save the item.
- The family's data stays theirs: a full export works at any time, and backups
  are boring and tested.

**Non-goals**

- Several households or tenants, and access from outside the VPN.
- Accounting or depreciation, and insurance-grade valuation.
- Native mobile apps. An installable PWA covers this.

---

## 2. Core concepts

Three questions about every item are kept separate:

| Question              | Concept                  | Example                                |
| --------------------- | ------------------------ | -------------------------------------- |
| Whose is it?          | **Owner**                | "Lena's bike", "the household's drill" |
| Where does it live?   | **Location / container** | Garage → Shelf 2 → Bin "Batteries"     |
| Who has it right now? | **Custody / loan**       | Lent to neighbour Tom, due Friday      |

- **User**: a family member, or a guest, with exactly one **role**.
- **Group**: a named set of users. A group can own items and can receive grants.
- **Household**: the implicit owner of shared things. It is a single settings row
  holding the name, currency and locale. It isn't a tenant.
- **Item type**: defines the custom fields (Book, Tool, Spare part, Clothing…).
- **Item**: one tracked thing, or a stock of interchangeable things (40× M6 screws).

---

## 3. Roles and permissions

### 3.1 Roles

| Role     | Intended for                                      | Summary                                                                                         |
| -------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `admin`  | 1–2 people                                        | Can do everything: users, roles, item types, all items including private ones, settings, export |
| `member` | Everyone in the family                            | Manages own items, edits household items, creates types and locations                           |
| `guest`  | Grandparents, babysitter, a friend on the tailnet | Sees only items explicitly shared with them, and can borrow them                                |

### 3.2 Item permission levels

`none < view < use < edit < manage`

- **view**: see the item, its photos and its history. Price and receipts are hidden.
- **use**: check it out or return it, move it, adjust stock, request a loan.
- **edit**: change fields, photos and tags. Can see price and receipts.
- **manage**: delete, transfer ownership, change visibility and grants, approve loans.

### 3.3 Visibility and grants

- `visibility = household` (default): every member can view the item.
- `visibility = private`: only the owner(s), admins and explicit grantees can see it.
  The UI says this plainly: _"Private: visible to you, admins and anyone you share with."_
- **Grants** (`item_grants`) give a user or group an extra level on one item,
  e.g. grant the "Guests" group `use` on the children's book collection, or grant a
  sibling `edit` on your bike.

### 3.4 Resolution rules

Take the **maximum** of all rules that apply, then cap it at the role's ceiling.

| Item ↓ / Role →                        | admin  | member      | guest                        |
| -------------------------------------- | ------ | ----------- | ---------------------------- |
| Household-owned                        | manage | edit        | grants only                  |
| Owned by me / my group                 | manage | manage      | n/a (guests don't own items) |
| Someone else's, `household` visibility | manage | view¹       | grants only                  |
| Someone else's, `private`              | manage | grants only | grants only                  |
| **Role ceiling**                       | manage | manage      | use                          |

¹ With `view` a member can **request** a loan. The owner approves it.

```ts
const L = { none: 0, view: 1, use: 2, edit: 3, manage: 4 } as const;
const CEILING = { admin: L.manage, member: L.manage, guest: L.use } as const;

export function itemLevel(ctx: AuthCtx, item: Item): number {
  if (ctx.role === "admin") return L.manage;

  let lvl: number = L.none;
  const ownsIt =
    (item.ownerKind === "user" && item.ownerId === ctx.userId) ||
    (item.ownerKind === "group" && ctx.groupIds.has(item.ownerId!));

  if (ownsIt) lvl = L.manage;
  else if (ctx.role === "member") {
    if (item.ownerKind === "household") lvl = L.edit;
    else if (item.visibility === "household") lvl = L.view;
  }

  lvl = Math.max(lvl, grantLevel(item, ctx.userId, ctx.groupIds));
  return Math.min(lvl, CEILING[ctx.role]);
}

export const canSeeMoney = (lvl: number) => lvl >= L.edit;
```

**Implementation rules**

- Lists and search never load every item and filter in code. One SQL predicate
  builder, `visibleItemsWhere(ctx)`, holds the `view` rules and is used by every
  list, search and export query. A property-based test checks that it agrees with
  `itemLevel(...) >= view` on randomly generated data.
- The server checks money visibility when it **serializes** an item, so it
  doesn't depend on the UI. Below `edit`, `price_cents`, `currency` and attachments
  of kind `receipt` are left out of the response. Price filters and sorting are
  only offered to users with `edit` or higher.

### 3.5 App-level actions

| Action                                      | admin      | member                                                 | guest |
| ------------------------------------------- | ---------- | ------------------------------------------------------ | ----- |
| Invite users / change roles / disable users | ✓          | –                                                      | –     |
| Create item types and locations             | ✓          | ✓                                                      | –     |
| Edit or delete item types (schema changes)  | ✓          | creator only, while no other user's items use the type | –     |
| Create items                                | ✓          | ✓                                                      | –     |
| Manage groups                               | ✓          | –                                                      | –     |
| Export                                      | everything | own and household items, without others' money fields  | –     |

### 3.6 Ownership lifecycle

- **Transfer**: the current owner (or anyone with `manage`) starts a transfer.
  The new owner **accepts** it, which works well for gifts and hand-me-downs. An
  admin can force a transfer.
- **User leaves or is disabled**: the admin reassigns their items, one by one or
  in bulk, to the household or to another user.
- Every ownership change is written to the event log.

---

## 4. Flexible assets

### 4.1 Hybrid model

Fields that every item has are **real columns**: name, owner, location, status,
quantity, photos, tags, dates, price, barcode and so on. Fields specific to a type
go into an **`attributes` JSON column**, validated against the item type's field
definitions.

### 4.2 Item types

- Types are stored in the database and edited in the UI, so new kinds of assets
  need no code change.
- **Inheritance**: `Tool → Power tool → Cordless tool`. A child type inherits its
  parent's fields and adds its own. Filtering by "Tool" includes subtypes.
- **Tracking mode** per type: `individual` (one row = one thing, optional serial
  number) or `stock` (quantity, unit and a `min_quantity` for low-stock alerts).
- Starter templates are seeded on first run and can be changed freely after that.

### 4.3 Field definition format

```json
{
  "key": "book",
  "name": "Buch",
  "icon": "book",
  "tracking": "individual",
  "fields": [
    {
      "key": "authors",
      "label": "Autor(en)",
      "kind": "text",
      "multiple": true,
      "required": true
    },
    {
      "key": "isbn",
      "label": "ISBN",
      "kind": "isbn",
      "lookup": ["dnb", "openlibrary"]
    },
    { "key": "publisher", "label": "Verlag", "kind": "text" },
    { "key": "year", "label": "Jahr", "kind": "integer", "min": 1450 },
    {
      "key": "format",
      "label": "Format",
      "kind": "select",
      "options": ["Gebunden", "Taschenbuch", "E-Book", "Hörbuch"]
    },
    { "key": "series", "label": "Reihe", "kind": "text" },
    {
      "key": "read_by",
      "label": "Gelesen von",
      "kind": "user",
      "multiple": true
    }
  ]
}
```

Field `key`s are English and stable. `label`s and `options` are German, the
text users see.

**Field kinds:** `text`, `longtext`, `integer`, `decimal` (with optional `unit`),
`measure` (value + unit, e.g. 12 V, 18 mm), `boolean`, `date`, `select`,
`multiselect`, `url`, `isbn`, `barcode`, `color`, `size` (value + size system),
`user` (reference to a user), `item` (reference to another item).

**Validation:** at runtime a Zod schema is built from the field definitions. The
same schema renders the form (TanStack Form) and does the server-side check
(server function input validator).

**Schema evolution**

- The stable `key` is the identity. Labels can be renamed freely.
- When a field is removed, it is hidden, not deleted, so old values stay visible
  under "Legacy fields" until someone cleans them up.
- If a field's kind changes or an item's type changes, the app first shows a
  migration preview ("12 items will lose `voltage`") and asks for confirmation.

### 4.4 Starter templates

| Type (UI name)                                     | Mode       | Key fields                                                                                                                         |
| -------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Book (_Buch_)                                      | individual | authors, ISBN (auto-fill, see §5.2), publisher, year, format, series, language, read by                                            |
| Tool (_Werkzeug_) → Power tool (_Elektrowerkzeug_) | individual | brand, model, serial, power source, battery system (e.g. "Bosch 18V", "Makita 18V LXT")                                            |
| Spare part (_Ersatzteil_)                          | stock      | manufacturer, part number, **fits** (item refs), dimensions, min quantity                                                          |
| Consumable (_Verbrauchsmaterial_)                  | stock      | unit, min quantity, preferred shop                                                                                                 |
| Clothing (_Kleidung_)                              | individual | category, size + size system (child sizes 50–176, women's/men's sizes 34–58 or XS–XXL, EU shoe sizes), colour, season, fits (user) |
| Electronics (_Elektronik_)                         | individual | brand, model, serial, warranty until (reminder before it ends), receipt (attachment)                                               |

### 4.5 Relationships

- **Containment**: locations form a tree (House → Garage → Shelf 2). An item can
  also be a **container** (a toolbox, a moving box), so items can sit inside items.
  The full path is shown as breadcrumbs.
- **Item relations**: `fits` (vacuum bag → vacuum cleaner), `accessory_of`,
  `part_of` (kit), `replaces`. The vacuum's page lists "Spare parts that fit
  this", with their stock levels.

### 4.6 Statuses

`available`, `in_use`, `on_loan`, `needs_repair`, `lost`, `outgrown`, `archived`,
`given_away`, `sold`, `disposed`. Items that are gone stay in the history but
are hidden from default views.

---

## 5. Key features

1. **Quick add from a phone**: pick a type, take a photo, enter the name, save.
   Everything else is optional.
2. **Scanning** with the browser's built-in **Barcode Detection API** (`BarcodeDetector`)
   - Formats used: `qr_code` (labels), `ean_13` (ISBN and product barcodes), `code_128`.
   - The camera feed comes from `getUserMedia` and is shown in a `<video>`
     element. Each frame is passed to `detector.detect()` with a
     `requestAnimationFrame` loop, throttled to about 8 fps. A hit triggers a
     vibration and a short beep.
   - **Feature detection:** the app checks
     `'BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats())`.
     If the API is missing, the "Scan" button turns into a **code entry field**
     where you type the short code or ISBN, with a hint about the system camera.
   - **Support:** the family's phones are all **Android**, where Chrome, Edge and
     Samsung Internet have the API, so in-app scanning works on every phone.
     Desktop Chrome on Windows and Linux lacks it, as do Firefox and Safari. On
     those, you type the code. That's OK, because scanning happens on phones.
   - ISBNs typed by hand are checked with the ISBN-13/ISBN-10 checksum before the lookup.
   - QR labels hold a full URL (`https://sub.example.de/q/K7M2QX`), so the phone's
     own camera app can open them too.
   - QR labels: every item and location gets a short code. The app prints label
     sheets (A4, Avery-style, e.g. Avery Zweckform L4732) and small labels for
     thermal printers. The QR codes are **generated** with the `qrcode` package,
     which doesn't depend on the Detection API.
   - **Book lookup chain** for German ISBNs: **Deutsche Nationalbibliothek SRU**
     (free, no key, best coverage for German books) → Open Library → Google Books.
     The server makes these calls outbound, which works behind the VPN.
   - **Shelf mode**: scan many books one after another. Each scan creates a Book
     with its data filled in.
3. **Loans and check-out**
   - Household items: anyone with `use` checks them out directly.
   - Personal items: a loan request goes to the owner, who approves it.
   - **External contacts** (neighbours without VPN access) can be recorded as
     borrowers, with a due date. They are only reminded by email, and the email
     contains no app links.
4. **Search and filters**: SQLite FTS5 full-text search over name, description,
   tags and flattened attributes. Faceted filters cover type, owner, location,
   status and tags, plus type-specific attributes such as "Kleidung, Größe 128, Winter".
   - **German compound words**: the FTS5 **`trigram` tokenizer** makes substring
     matches work, so "schrauber" finds "Akkuschrauber" and "säge" finds
     "Stichsäge". Queries need at least 3 characters. Shorter ones fall back to a
     prefix `LIKE` on the name.
   - Umlauts and ß: the indexed text and the query are normalized the same way
     (lowercase, `ß→ss`, diacritics removed), so "Sage", "Säge" and "SÄGE" all
     match. This needs SQLite ≥ 3.45 for `trigram remove_diacritics`. CI checks
     the bundled version.
5. **Hand-me-downs**: mark clothing as `outgrown`, then the app suggests the
   user whose stored size matches and starts an ownership transfer.
6. **Reminders** through **Web Push** (installed PWA on Android Chrome)
   and, optionally, email: loans due, low stock, warranties about to end,
   pending transfer or loan requests. They are sent at 08:00 Europe/Berlin. Push goes out through the
   browser vendors' push services, so it works even though the app is VPN-only.
7. **History**: every change is stored as an event with who, when and a field
   diff, so "Who moved my drill?" can be answered.
8. **Attachments**: photos (thumbnails generated, **EXIF/GPS stripped**),
   receipts and manuals as PDFs.
9. **Import / export**: CSV import with column mapping for each type. Full export
   as JSON + CSV + photos in one ZIP.

---

## 6. Data model (SQLite)

```sql
-- Identity -----------------------------------------------------------------
settings       (id INTEGER PK CHECK (id = 1), household_name, currency, locale)
users          (id TEXT PK, username TEXT UNIQUE, email TEXT UNIQUE NULL,
                display_name, role TEXT CHECK (role IN ('admin','member','guest')),
                locale, created_at, disabled_at NULL)
-- Better Auth owns: session, account (password hash), passkey, verification
groups         (id PK, name UNIQUE)
group_members  (group_id FK, user_id FK, PRIMARY KEY (group_id, user_id))
invites        (id PK, role, token_hash, expires_at, created_by, accepted_at NULL)
push_subs      (id PK, user_id FK, endpoint UNIQUE, p256dh, auth, created_at)

-- Catalog ------------------------------------------------------------------
item_types     (id PK, parent_id FK NULL, key UNIQUE, name, icon,
                tracking TEXT CHECK (tracking IN ('individual','stock')),
                fields JSON NOT NULL, created_by, archived_at NULL)
locations      (id PK, parent_id FK NULL, name, kind, short_code UNIQUE, notes)

items          (id TEXT PK,                      -- UUIDv7
                type_id FK, name, description,
                owner_kind TEXT CHECK (owner_kind IN ('household','user','group')),
                owner_id TEXT NULL,
                visibility TEXT CHECK (visibility IN ('household','private')) DEFAULT 'household',
                location_id FK NULL, container_item_id FK NULL,
                quantity REAL DEFAULT 1, unit TEXT NULL, min_quantity REAL NULL,
                status TEXT NOT NULL DEFAULT 'available',
                condition TEXT NULL, acquired_on DATE NULL,
                price_cents INTEGER NULL, currency TEXT NULL,
                barcode TEXT NULL, short_code TEXT UNIQUE,
                attributes JSON NOT NULL DEFAULT '{}',
                created_by FK, created_at, updated_at,
                version INTEGER NOT NULL DEFAULT 1)  -- optimistic locking

item_grants    (item_id FK, principal_kind CHECK IN ('user','group'), principal_id,
                level CHECK IN ('view','use','edit','manage'),
                PRIMARY KEY (item_id, principal_kind, principal_id))
item_relations (from_item_id, to_item_id, kind CHECK IN ('fits','accessory_of','part_of','replaces'),
                PRIMARY KEY (from_item_id, to_item_id, kind))
tags           (id PK, name UNIQUE, color)
item_tags      (item_id, tag_id, PRIMARY KEY (item_id, tag_id))
attachments    (id PK, item_id FK, kind CHECK IN ('photo','receipt','manual','other'),
                sha256, mime, bytes, original_name, sort, created_by, created_at)

-- Activity -----------------------------------------------------------------
contacts       (id PK, name, email NULL, phone NULL)       -- external borrowers
loans          (id PK, item_id FK, quantity,
                borrower_user_id NULL, borrower_contact_id NULL,
                status CHECK IN ('requested','approved','out','returned','declined'),
                requested_at, approved_by NULL, out_at NULL, due_at NULL, returned_at NULL, note)
transfers      (id PK, item_id, from_owner_kind, from_owner_id, to_owner_kind, to_owner_id,
                status CHECK IN ('pending','accepted','declined','forced'), created_by, created_at)
stock_moves    (id PK, item_id, delta REAL, reason, user_id, at)
events         (id PK, item_id NULL, actor_id, action, diff JSON, at)
notifications  (id PK, user_id, kind, payload JSON, read_at NULL, created_at)
jobs           (id PK, kind, payload JSON, run_at, attempts, locked_until NULL, done_at NULL)

-- Search -------------------------------------------------------------------
CREATE VIRTUAL TABLE items_fts USING fts5(name, description, tags, attrs,
                                          tokenize='trigram remove_diacritics 1');
```

Notes

- "Overdue" isn't stored. It is computed as `status = 'out' AND due_at < now`.
- Indexes go on `items(owner_kind, owner_id)`, `items(type_id)`,
  `items(location_id)`, `items(barcode)` and `loans(status, due_at)`.
- Attribute filters use `json_extract(attributes, '$.size')`. If one attribute
  gets queried a lot, it can get a **generated column + index**.
- Each edit sends `version`, and a stale version is rejected with a conflict, so
  two phones editing the same item don't silently overwrite each other.
- Attachments are stored content-addressed on disk (`uploads/ab/cd/<sha256>`).
  The app serves them through an authorized route, never as static files, so the
  money and private-item rules also apply to receipts and photos.

---

## 7. Tech stack and architecture

| Concern       | Choice                                                  | Notes                                                                                                                            |
| ------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Runtime       | **Bun 1.4**                                             | Also the package manager, test runner and script runner                                                                          |
| Framework     | **TanStack Start** (Solid, SSR)                         | File-based TanStack Router; `createServerFn` for UI data; server routes for `/api/v1/*`, `/q/:code`, `/files/:id`                |
| Data fetching | TanStack Query                                          | Integrated with the router loaders; optimistic updates for check-out and stock ±                                                 |
| Forms         | TanStack Form + Zod                                     | Dynamic forms built from item-type field definitions                                                                             |
| Lists         | TanStack Table + TanStack Virtual                       | Item grid or list, column picker per type                                                                                        |
| Database      | SQLite via **`bun:sqlite`** + **Drizzle ORM**           | WAL mode; migrations with `drizzle-kit`, run at startup                                                                          |
| Auth          | **Better Auth**                                         | Username + password (no email needed), **passkeys** (they work because the app has a real domain and HTTPS), invite-only         |
| UI            | Tailwind CSS + shadcn/ui                                | Accessible components, works well on phones                                                                                      |
| PWA           | `vite-plugin-pwa`                                       | Installable app, offline shell, Web Push service worker                                                                          |
| Images        | `sharp`                                                 | Thumbnails (WebP), EXIF strip, auto-rotate                                                                                       |
| Scanning      | Native `BarcodeDetector`                                | Feature-detected, with a manual entry fallback (§5.2)                                                                            |
| QR generation | `qrcode`                                                | SVG for printing labels                                                                                                          |
| Language      | German only. Strings in one catalog file (Paraglide JS) | Costs almost nothing, and English could be added later without touching components. `Intl` with `de-DE` for dates, numbers and € |
| Email / push  | `nodemailer` (SMTP) + `web-push`                        | Both only make outbound connections                                                                                              |
| Jobs          | `jobs` table + in-process worker loop                   | Reminders, thumbnails, low-stock checks; no Redis                                                                                |
| Quality       | `bun test`, Playwright, Biome                           | Permission matrix tests run on every commit                                                                                      |

**Watch-outs**

- TanStack Start is young compared with Next.js. Pin exact versions and upgrade
  on purpose.
- Bun's Node compatibility covers everything listed above. Smoke-test `sharp` and
  `web-push` in the production image in CI.
- `bun:sqlite` is synchronous. That is fine at this scale, but anything slow
  (thumbnails, bulk import) goes through the job worker.

```
 Family phone / laptop  ──(Tailscale)──┐
                                        ▼
 ┌──────────────────────────── VPS ───────────────────────────────┐
 │  ┌─────────────── shared network namespace ───────────────┐    │
 │  │  tailscale (node "hausmeister", 100.x.y.z)             │    │
 │  │  caddy :443  TLS for sub.example.de (DNS-01)           │    │
 │  └───────────────────────────┬────────────────────────────┘    │
 │                              │ http://app:3000 (docker network) │
 │  ┌───────────────────────────▼────────────────────────────┐    │
 │  │  app: Bun + TanStack Start                             │    │
 │  │   routes / server fns / authz / job worker / Drizzle   │    │
 │  └──────┬───────────────────────────────┬─────────────────┘    │
 │   /data/db/app.sqlite             /data/uploads                │
 │         │ litestream                    │ restic (nightly)      │
 └─────────┼───────────────────────────────┼──────────────────────┘
           ▼                               ▼
                 Backblaze B2 bucket (off-site, S3 API)
```

**API sketch** (server routes, for scripts and export; the UI uses server functions with the same authz)

```
GET    /api/v1/items?q=&type=&owner=&location=&status=&attr.size=128
POST   /api/v1/items
GET    /api/v1/items/:id            PATCH (needs version)   DELETE
POST   /api/v1/items/:id/attachments
POST   /api/v1/items/:id/transfer   POST /api/v1/transfers/:id/accept
POST   /api/v1/items/:id/loans      POST /api/v1/loans/:id/{approve,checkout,return}
POST   /api/v1/items/:id/stock      {delta, reason}
GET    /q/:shortCode                → redirect to the item or location page
GET    /files/:attachmentId[?size=thumb]
GET    /api/v1/export               → ZIP
```

API access for scripts uses personal API tokens (hashed in the DB, scoped to
read or write), and they are only reachable over the VPN.

---

## 8. Deployment: VPN-only with your own domain

### 8.1 How it works

1. **Tailscale** runs as a sidecar container and joins your tailnet as node
   `hausmeister`, which gets a fixed tailnet IP like `100.101.102.103`.
2. **DNS**: `example.de` stays at Strato, including its nameservers, website and
   Strato mail. In Strato's DNS settings, the subdomain `sub` gets its own DNS
   servers, `ns1.desec.io` and `ns2.desec.org`, so the zone `sub.example.de` lives at
   **deSEC** (a German non-profit DNS host with an API). Strato's DNS has no API, and
   the earlier plan of a CNAME to a free `dedyn.io` zone fell through because deSEC
   suspended `dedyn.io` registrations. The records are created by
   `deploy/host/desec-setup.sh`.
   - `sub.example.de A 100.101.102.103` (the tailnet IP), with **no AAAA** record.
     Anyone can look the name up, but the address can only be reached from inside
     your tailnet. No split DNS is needed.
   - Strato's wildcard MX and its old A record for `app` no longer apply once the
     subdomain is delegated.
3. **TLS**: the Let's Encrypt HTTP challenge can't reach the server, so Caddy
   uses the **DNS-01 challenge**. You get a real, trusted certificate for
   `sub.example.de`, which passkeys, the PWA install and Web Push all need.
   - Caddy writes `_acme-challenge.sub.example.de` TXT at deSEC through
     `caddy-dns/desec`. Renewals run fully automatically.
   - The Caddy token is **restricted by deSEC token policies**: by default it may
     write nothing, and it may write only that one TXT record. A leaked token can't
     change the A record, and it never had access to `example.de` at all. It can
     optionally be locked to the VPS's public IP.
   - Test against the Let's Encrypt _staging_ endpoint first, in Phase 0.
4. **Mail lock-down for the app subdomain**: `example.de` keeps its Strato mail
   (MX, DKIM, DMARC `p=reject`). The app subdomain sends and receives no mail, so its
   zone says so explicitly:
   ```
   sub.example.de          TXT  "v=spf1 -all"
   _dmarc.sub.example.de   TXT  "v=DMARC1; p=reject"
   sub.example.de          MX   0 .          (null MX, RFC 7505)
   ```
   Reminder email, if it's ever turned on, goes through an existing mailbox, such as
   your Strato mailbox, not through `sub.example.de` (§8.6).
5. **Caddy shares the Tailscale container's network namespace**, so it listens
   only on the tailnet interface. No app ports are published on the host, which
   also avoids the common trap where ports Docker publishes skip `ufw` rules.

Tailscale's own HTTPS certificates and `tailscale serve` only cover
`*.ts.net` names. That is why Caddy and DNS-01 handle your custom domain.

### 8.2 Files

```yaml
# compose.yaml
services:
  tailscale:
    image: tailscale/tailscale:v1.104.4
    hostname: hausmeister
    environment:
      TS_AUTHKEY: ${TS_AUTHKEY} # one-off key, tagged tag:hausmeister
      TS_STATE_DIR: /var/lib/tailscale
      TS_EXTRA_ARGS: --advertise-tags=tag:hausmeister
    volumes: ["./ts-state:/var/lib/tailscale"]
    devices: ["/dev/net/tun:/dev/net/tun"]
    cap_add: [NET_ADMIN, NET_RAW]
    restart: unless-stopped

  caddy:
    build: ./caddy # Caddy + DNS provider plugin
    network_mode: service:tailscale # listens on the tailnet only
    environment:
      DESEC_TOKEN: ${DESEC_TOKEN} # may only write _acme-challenge TXT
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on: [tailscale, app]
    restart: unless-stopped

  app:
    image: ghcr.io/<you>/hausmeister:1.0.0 # pinned tag
    environment:
      ORIGIN: https://sub.example.de
      DATABASE_PATH: /data/db/app.sqlite
      UPLOAD_DIR: /data/uploads
      BETTER_AUTH_SECRET: ${AUTH_SECRET}
      SMTP_URL: ${SMTP_URL:-} # optional, empty = no email
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}
    volumes: ["./data:/data"]
    healthcheck: { test: ["CMD", "bun", "run", "healthcheck"] }
    restart: unless-stopped

  litestream:
    image: litestream/litestream:0.5.18
    command: replicate
    volumes:
      - ./data/db:/data/db
      - ./litestream.yml:/etc/litestream.yml:ro
    env_file: .env.backup
    restart: unless-stopped

volumes: { caddy_data: {} }
```

```dockerfile
# caddy/Dockerfile
FROM caddy:2.11.9-builder AS build
RUN xcaddy build --with github.com/caddy-dns/desec
FROM caddy:2.11.9
COPY --from=build /usr/bin/caddy /usr/bin/caddy
```

```
# Caddyfile
{
  # Phase 0: use staging until DNS-01 is proven, then remove this line
  acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}

sub.example.de {
  tls {
    dns desec {
      token {env.DESEC_TOKEN}
    }
  }
  encode zstd gzip
  request_body { max_size 25MB }
  reverse_proxy app:3000
}
```

```dockerfile
# Dockerfile (app)
FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
ENV NODE_ENV=production PORT=3000
CMD ["bun", "run", ".output/server/index.mjs"]
```

(The exact build output path depends on the TanStack Start version and
deployment preset. CI checks that `sharp`'s platform binaries end up in the
runtime image.)

### 8.3 Tailscale setup

- Each family member installs the Tailscale app on their phone and laptop, then
  logs into the family tailnet, or the node is **shared** with their own Tailscale account.
- Access rules (ACL) allow only family users to reach port 443 on `tag:hausmeister`.
  Admins additionally get `tcp:22` and Tailscale SSH to their **own** host node
  (`autogroup:self`); the tagged sidecar stays 443-only:
  ```json
  {
    "grants": [
      { "src": ["group:family"], "dst": ["tag:hausmeister"], "ip": ["tcp:443"] },
      { "src": ["autogroup:admin"], "dst": ["autogroup:self"], "ip": ["tcp:22"] }
    ],
    "ssh": [
      {
        "action": "check",
        "src": ["autogroup:admin"],
        "dst": ["autogroup:self"],
        "users": ["admin"],
        "checkPeriod": "12h"
      }
    ]
  }
  ```
  The host must opt in with `sudo tailscale up --ssh` (PHASE0 step 10). `sub.example.de`
  points at the sidecar, so SSH uses the host's own tailnet IP, not that name.
- Guests get the same node shared with them, and their app role is `guest`.
- **Plan:** the free Personal plan currently allows up to **6 users** with
  unlimited user devices (changed in April 2026; it used to be 3 users). That
  covers 5 people and about 10 devices. It is meant for non-commercial use, which
  a family is. Two things are worth knowing:
  - Guests also count as users. With 5 family members, there is room for exactly
    **one** guest in the tailnet. More guests can get the node **shared** to their
    own Tailscale accounts instead.
  - The free plan allows up to 3 ACL groups, and this setup needs one
    (`group:family`).
- Phones can use Tailscale's always-on mode, or turn it on when needed. If the
  VPN is off, a scanned QR label just fails to load. The PWA shows a clear
  "connect to the VPN" offline page from its service worker.

### 8.4 Host hardening

- Debian 13, `unattended-upgrades`. Admin access uses **Tailscale SSH**
  (identity-based, no key, no public port); the key-only sshd from `bootstrap.sh`
  stays as a local fallback with root login disabled.
- `ufw`: deny all inbound traffic, including port 22. Tailscale SSH runs over
  WireGuard inside the Tailscale daemon, so it needs no ufw rule and does not use
  sshd; keep the provider console as the emergency way in. Optionally allow UDP
  41641 so devices can connect directly instead of through a Tailscale relay.
- App: rate-limited login with lockout, CSRF checks on server functions, strict
  CSP, and uploads checked by file content (magic bytes), never by extension.
- Domain specifics:
  - Session cookies are **host-only** with the `__Host-` prefix (`Secure`,
    `Path=/`, `SameSite=Lax`, no `Domain`), so a future subdomain can never read them.
  - The passkey RP ID is set explicitly to `sub.example.de`.
  - HSTS is sent **without** `includeSubDomains`/`preload`, so other subdomains
    you might add later aren't forced onto HTTPS.
- The VPN is the outer wall. App login and authorization still apply in full,
  because guests are on the same tailnet.

### 8.5 Backups (3-2-1)

- Litestream continuously replicates the SQLite database to a Backblaze B2
  bucket (via B2's S3-compatible API) and can restore to any point in time.
- The B2 bucket is private, uses a bucket-scoped application key, and keeps
  hidden (deleted) file versions for 30 days as a guard against accidental deletes.
- `restic` backs up `/data/uploads` every night, keeping 7 daily, 4 weekly and
  12 monthly snapshots.
- Store `./ts-state`, the `.env` secrets and the VAPID keys in a password
  manager or encrypted backup. Without them, push subscriptions break and the
  server's tailnet identity is lost.
- A **monthly restore test** is scripted with `bun run restore-test`, which
  restores into a throwaway container and checks the health endpoint plus the item count.
- On top of that, an admin can download the full ZIP export from the app.

### 8.6 Operations

- Upgrade: `docker compose pull && docker compose up -d`. A database snapshot is
  taken before migrations run.
- Monitoring: the app pings healthchecks.io every 5 minutes (outbound only, so it
  works VPN-only) and reports Litestream replication lag.
- **Email is optional.** Reminders go out as Web Push (all phones are Android).
  Invites are links you send by messenger, and an admin resets passwords.
  Without email, the only loss is reminders to external borrowers. If you want
  email anyway, use an existing mailbox's SMTP (a dedicated GMX or Gmail
  account with an app password) as the sender, not the domain. That way the
  lock-down records in §8.1 stay as they are.

---

## 9. UI map

- **Home**: search bar, a "Scan" button, my loans, what's due back, low stock, pending requests.
- **Items**: grid or list, faceted filters, saved views ("Winter clothes").
- **Item detail**: photos, fields, location breadcrumbs, owner, current holder,
  related parts, history, and actions (borrow, move, transfer, print label).
- **Add item**: pick a type → dynamic form. You can scan a barcode or ISBN to fill fields in.
- **Locations**: a tree browser, so you can see everything in "Garage → Shelf 2".
- **Scan**: full-screen camera. Scanning a code opens the item or location, with
  quick actions (check out, return, ±stock).
- **Admin**: users and roles, groups, invites, item types (schema editor with
  live form preview), tags, settings, export.
- German UI (strings in one Paraglide catalog, see §7). Phone layout first. Meets WCAG AA.

---

## 10. Roadmap

| Phase        | Scope                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0: Infra** | ① Domain zone at deSEC + restricted token · ② Strato nameservers → deSEC · VPS, Tailscale sidecar · DNS records (A, no AAAA, SPF/DMARC/null MX lock-down) · Caddy DNS-01 (staging → production) · Litestream + restic, restore test · a "Hallo" app deployed |
| **MVP**      | Invite and login (password + passkey), roles, groups · item types with custom fields and templates · items, locations, containers, photos · visibility, grants, money hiding · search and filters · event log · export                                       |
| **v1.1**     | QR labels and scan mode · ISBN lookup (DNB → Open Library) and shelf mode · loans (internal and external contacts) · stock items with low-stock alerts · ownership transfers                                                                                 |
| **v1.2**     | PWA install + Web Push reminders · optional email (external borrowers) · CSV import · hand-me-down flow · warranty expiry · item relations ("fits")                                                                                                          |
| **Later**    | Offline add queue in the PWA · personal API tokens · photo-based "what's in this box" search                                                                                                                                                                 |

Phase 0 comes first on purpose. The VPN, DNS and TLS setup is the part most
likely to hold surprises, so it gets proven before any features are built.

---

## 11. Testing focus

- **Authorization is the riskiest part.** Table-driven tests cover every
  role × ownership × visibility × grant combination. A property test checks that
  `visibleItemsWhere` matches `itemLevel`. Serialization tests check that money
  fields and receipts never leave the server below `edit`. Endpoints return
  "not found", never "forbidden", for items the user can't see, so their
  existence isn't revealed.
- Schema tests check that the Zod schema built from field definitions accepts
  and rejects the right values, and that legacy fields still work.
- E2E tests (Playwright): add an item with a photo on a phone-sized viewport, the
  scan → check-out flow, and the loan request → approve flow.
- Backup restore test runs in CI against a sample dataset.

---

## 12. Open questions

None that block Phase 0.

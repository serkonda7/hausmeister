# Hausmeister: Family Asset Manager (Design)

A self-hosted web app where a family tracks what it owns (books, tools, spare
parts, clothes, electronics): **who owns each thing**, **where it is**, **who
has it right now** and **who may do what**.

Status: design v3.3, 2026-11-18. Phase 0, the MVP and v1.1 are done (§10).

---

## 0. Decisions

| Topic | Decision |
| --- | --- |
| Tenancy | **One household** per instance. No multi-tenancy. |
| Roles | `admin`, `member`, `guest`. No separate child/adult roles. |
| Network | **VPN-only** through hosted **Tailscale** (free Personal plan), on our own domain with a trusted TLS certificate (§8). |
| Domain | `sub.example.de`, delegated by NS records from Strato to **deSEC** for the DNS-01 challenge. `example.de` (website, mail) stays untouched at Strato (§8.1). |
| Email | Optional. Reminders go out as Web Push. |
| Private items | Admins **can** see members' private items. |
| Money | Prices and receipts are **hidden** below `edit` on the item, so from every guest. |
| Language | **German** UI only; de-DE formats, €, Europe/Berlin. Code and field keys in English. |
| Scanning | The browser's **Barcode Detection API** only (all family phones are Android). Typing the code is the fallback. |
| Stack | **Bun + TanStack Start** (Solid), details in §7. |

---

## 1. Goals and non-goals

**Goals**

- Runs on one small VPS (1 vCPU, 1–2 GB RAM) with little upkeep.
- Nothing is exposed to the public internet; admin SSH uses Tailscale SSH.
- A person, a group ("Parents", "Garage crew") or the household can own an
  item. Roles and per-item sharing decide who sees and changes it.
- Any kind of asset fits: item types define their own fields, without code changes.
- Phone first: scan a QR label or an ISBN, or take a photo and save.
- The family's data stays theirs: full export at any time, boring and tested backups.

**Non-goals**: several households, access from outside the VPN, accounting or
insurance-grade valuation, native apps (the PWA covers that).

---

## 2. Core concepts

| Question | Concept | Example |
| --- | --- | --- |
| Whose is it? | **Owner** | "Lena's bike", "the household's drill" |
| Where does it live? | **Location / container** | Garage → Shelf 2 → Bin "Batteries" |
| Who has it right now? | **Custody / loan** | Lent to neighbour Tom, due Friday |

- **User**: a family member or guest with exactly one **role**.
- **Group**: a named set of users; can own items and receive grants.
- **Household**: the implicit owner of shared things; one settings row (name,
  currency, locale), not a tenant.
- **Item type**: defines custom fields (Book, Tool, Spare part, Clothing…).
- **Item**: one thing, or a stock of interchangeable things (40× M6 screws).

---

## 3. Roles and permissions

### 3.1 Roles

| Role | For | Can |
| --- | --- | --- |
| `admin` | 1–2 people | Everything: users, roles, item types, all items incl. private ones, settings, export |
| `member` | The family | Manage own items, edit household items, create types and locations |
| `guest` | Grandparents, babysitter, a friend on the tailnet | See and borrow only items shared with them |

### 3.2 Item permission levels

`none < view < use < edit < manage`

- **view**: see the item, its photos and history. No price or receipts.
- **use**: check out/return, move, adjust stock, request a loan.
- **edit**: change fields, photos, tags. Sees price and receipts.
- **manage**: delete, transfer ownership, change visibility and grants, approve loans.

### 3.3 Visibility and grants

- `visibility = household` (default): every member can view the item.
- `visibility = private`: only owner(s), admins and grantees see it. UI text:
  _"Private: visible to you, admins and anyone you share with."_
- **Grants** (`item_grants`) give a user or group a level on one item, e.g.
  the "Guests" group `use` on the children's books.

### 3.4 Resolution rules

Take the **maximum** of all matching rules, then cap at the role's ceiling.

| Item ↓ / Role → | admin | member | guest |
| --- | --- | --- | --- |
| Household-owned | manage | edit | grants only |
| Owned by me / my group | manage | manage | n/a (guests own nothing) |
| Someone else's, `household` visibility | manage | view¹ | grants only |
| Someone else's, `private` | manage | grants only | grants only |
| **Role ceiling** | manage | manage | use |

¹ With `view` a member can **request** a loan; the owner approves it.

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

- Never load all items and filter in code. One SQL predicate builder,
  `visibleItemsWhere(ctx)`, holds the `view` rules and is used by every list,
  search and export query. A property test checks it against
  `itemLevel(...) >= view` on random data.
- Money is enforced when the server **serializes** an item: below `edit`,
  `price_cents`, `currency` and `receipt` attachments are dropped. Price
  filters and sorting exist only from `edit`.

### 3.5 App-level actions

| Action | admin | member | guest |
| --- | --- | --- | --- |
| Invite users / change roles / disable users | ✓ | – | – |
| Create item types and locations | ✓ | ✓ | – |
| Edit or delete item types | ✓ | creator only, while no other user's items use the type | – |
| Create items | ✓ | ✓ | – |
| Manage groups | ✓ | – | – |
| Export | everything | own and household items, without others' money fields | – |

### 3.6 Ownership lifecycle

- **Transfer**: anyone with `manage` offers the item to a user or group, the new owner **accepts** (gifts, hand-me-downs); for a group, any member accepts. An admin can force a pending offer. One pending offer per item; accepting fails if the owner changed in the meantime.
- Someone who is neither an admin nor the item's direct user owner (a `manage` grantee, a co-member of the owning group) may offer it only to others, never to themselves or their own groups, and the owner is told. A direct owner change without acceptance stays with admins and the direct user owner (to the household or their own groups).
- **User leaves or is disabled**: an admin reassigns their items (singly or in
  bulk) to the household or another user.
- Every ownership change goes to the event log.

---

## 4. Flexible assets

### 4.1 Hybrid model

Fields every item has are **columns** (name, owner, location, status,
quantity, photos, tags, dates, price, barcode…). Type-specific fields live in
an **`attributes` JSON column**, validated against the type's field definitions.

### 4.2 Item types

- Stored in the database and edited in the UI.
- **Inheritance**: `Tool → Power tool → Cordless tool`. A child inherits its
  parent's fields; filtering by "Tool" includes subtypes.
- **Tracking mode**: `individual` (one row = one thing, optional serial) or
  `stock` (quantity, unit, `min_quantity` for low-stock alerts).
- Starter templates are seeded on first run and freely editable.

### 4.3 Field definition format

```json
{
  "key": "book",
  "name": "Buch",
  "icon": "book",
  "tracking": "individual",
  "fields": [
    { "key": "authors", "label": "Autor(en)", "kind": "text", "multiple": true, "required": true },
    { "key": "isbn", "label": "ISBN", "kind": "isbn", "lookup": ["dnb", "openlibrary"] },
    { "key": "publisher", "label": "Verlag", "kind": "text" },
    { "key": "year", "label": "Jahr", "kind": "integer", "min": 1450 },
    { "key": "format", "label": "Format", "kind": "select", "options": ["Gebunden", "Taschenbuch", "E-Book", "Hörbuch"] },
    { "key": "series", "label": "Reihe", "kind": "text" },
    { "key": "read_by", "label": "Gelesen von", "kind": "user", "multiple": true }
  ]
}
```

`key`s are English and stable; `label`s and `options` are the German UI text.

**Field kinds:** `text`, `longtext`, `integer`, `decimal` (optional `unit`),
`measure` (value + unit: 12 V, 18 mm), `boolean`, `date`, `select`,
`multiselect`, `url`, `isbn`, `barcode`, `color`, `size` (value + size
system), `user` (user reference), `item` (item reference).

**Validation:** a Zod schema built at runtime from the field definitions
renders the form (TanStack Form) and validates server function input.

**Schema evolution**

- `key` is the identity; labels can be renamed freely.
- A removed field is hidden, not deleted: old values stay visible under
  "Legacy fields" until cleaned up.
- Changing a field's kind or an item's type first shows a migration preview
  ("12 items will lose `voltage`") and asks for confirmation.

### 4.4 Starter templates

| Type (UI name) | Mode | Key fields |
| --- | --- | --- |
| Book (_Buch_) | individual | authors, ISBN (auto-fill, §5), publisher, year, format, series, language, read by |
| Tool (_Werkzeug_) → Power tool (_Elektrowerkzeug_) | individual | brand, model, serial, power source, battery system ("Bosch 18V", "Makita 18V LXT") |
| Spare part (_Ersatzteil_) | stock | manufacturer, part number, **fits** (item refs), dimensions, min quantity |
| Consumable (_Verbrauchsmaterial_) | stock | unit, min quantity, preferred shop |
| Clothing (_Kleidung_) | individual | category, size + size system (child 50–176, women's/men's 34–58 or XS–XXL, EU shoes), colour, season, fits (user) |
| Electronics (_Elektronik_) | individual | brand, model, serial, warranty until (reminder), receipt (attachment) |

### 4.5 Relationships

- **Containment**: locations form a tree (House → Garage → Shelf 2). An item
  can be a **container** (toolbox, moving box), so items nest. The path shows
  as breadcrumbs.
- **Item relations**: `fits` (vacuum bag → vacuum), `accessory_of`, `part_of`
  (kit), `replaces`. The vacuum's page lists "Spare parts that fit this" with
  stock levels.

### 4.6 Statuses

`available`, `in_use`, `on_loan`, `needs_repair`, `lost`, `outgrown`,
`archived`, `given_away`, `sold`, `disposed`. Gone items stay in the history
but are hidden from default views.

---

## 5. Key features

1. **Quick add from a phone**: type, photo, name, save. Everything else is optional.
2. **Scanning** with `BarcodeDetector`:
   - Formats: `qr_code` (labels), `ean_13` (ISBN, products), `code_128`.
   - `getUserMedia` feeds a `<video>`; a `requestAnimationFrame` loop calls
     `detector.detect()` at ~8 fps. A hit vibrates and beeps.
   - Feature check: `'BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats())`.
     Without it (desktop Chrome on Windows/Linux, Firefox, Safari) "Scan"
     becomes a **code entry field** for the short code or ISBN, with a hint to
     use the system camera. Android Chrome, Edge and Samsung Internet have it.
   - Typed ISBNs are checksum-validated (ISBN-13/-10) before lookup.
   - QR labels encode a full URL (`https://sub.example.de/q/K7M2QX`), so the
     phone's camera app opens them too. Every item and location has a short
     code. Label sheets: A4 Avery-style (Avery Zweckform L4732) and thermal
     labels, generated with `qrcode`.
   - **Book lookup** for German ISBNs: Deutsche Nationalbibliothek SRU (free, no key, best German coverage) → Open Library → Google Books, in the order the type's ISBN field lists them. Outbound calls from the server, only the ISBN is sent; a failing or rate-limiting source falls through to the next, results are cached for a day. `ISBN_LOOKUP=off` keeps everything local.
   - **Shelf mode**: scan books in a row; each scan creates a filled-in Book at the chosen place. Books already in the inventory (ISBN-10 or -13) are flagged instead of added twice; unknown ones link to quick add with the ISBN prefilled.
   - A barcode or ISBN that is no label finds the visible items carrying it (barcode column or any attribute value).
3. **Loans and check-out**
   - Anyone with `use` checks an item out directly: for household items every member, for shared ones the grantees. Admins and members can also lend it to another user or an external contact; guests only to themselves.
   - With only `view` (someone else's item), a **loan request** goes to the item's managers (owner, owning group, `manage` grantees; admins for household items). They approve (optionally handing it over at once) or decline; the borrower can withdraw it, pick up an approved loan and return it.
   - Individual items are out once at a time and show `on_loan`; stock items lend quantities up to the stock. Gone items cannot be lent.
   - Who has an item (out loans) is visible to everyone who sees it; requests only to the managers and the borrower.
   - **External contacts** (neighbours without VPN) can borrow with a due date. They get email reminders only, without app links (v1.2).
4. **Search and filters**: SQLite FTS5 over name, description, tags and
   flattened attributes. Facets: type, owner, location, status, tags and
   type-specific attributes ("Kleidung, Größe 128, Winter").
   - **Compound words**: the `trigram` tokenizer matches substrings
     ("schrauber" → "Akkuschrauber"). Queries under 3 characters fall back to
     a prefix `LIKE` on the name.
   - Index text and query are normalized alike (lowercase, `ß→ss`, no
     diacritics), so "Sage", "Säge" and "SÄGE" match. Needs SQLite ≥ 3.45
     (`trigram remove_diacritics`); CI checks the bundled version.
5. **Hand-me-downs**: mark clothing `outgrown`; the app suggests the user whose
   size matches and starts a transfer.
6. **Reminders** at 08:00 Europe/Berlin through **Web Push** (installed PWA) and optionally email: loans due, low stock, warranties ending, pending transfers or loan requests. Push uses the browser vendors' services, so it works VPN-only.
   - Since v1.1 the same notices land in an **in-app inbox** (header badge): falling below a minimum stock (to the item's owners: user, group members, or every admin and member for household items; withdrawn when restocked), loan requests and answers, transfer offers and outcomes.
7. **History**: every change is an event with actor, time and field diff
   ("Who moved my drill?").
8. **Attachments**: photos (thumbnails, **EXIF/GPS stripped**), receipts and
   manuals as PDF.
9. **Import / export**: CSV import with per-type column mapping. Full export as
   one ZIP with JSON, CSV and files (`docs/export-format.md`).

---

## 6. Data model (SQLite)

Target model; the implemented schema is `src/server/db/schema.ts`.

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
contacts       (id PK, name, email NULL, phone NULL, notes NULL, created_by, created_at)  -- external borrowers
loans          (id PK, item_id FK, quantity,
                borrower_user_id NULL, borrower_contact_id NULL,
                status CHECK IN ('requested','approved','out','returned','declined','cancelled'),
                requested_by, created_at, decided_by NULL, decided_at NULL, lent_by NULL,
                out_at NULL, due_on DATE NULL, returned_at NULL, returned_by NULL, note)
transfers      (id PK, item_id, from_owner_kind, from_owner_id, to_owner_kind, to_owner_id,
                status CHECK IN ('pending','accepted','declined','forced','cancelled'),
                note, created_by, created_at, resolved_by NULL, resolved_at NULL)
                -- UNIQUE (item_id) WHERE status = 'pending'
stock_moves    (id PK, item_id, delta REAL, quantity_after REAL,
                reason CHECK IN ('used','restocked','counted','edited','other'), note, user_id, at)
events         (id PK, item_id NULL, actor_id, action, diff JSON, at)
notifications  (id PK, user_id, kind, item_id NULL, payload JSON, read_at NULL, created_at)
jobs           (id PK, kind, payload JSON, run_at, attempts, locked_until NULL, done_at NULL)

-- Search -------------------------------------------------------------------
CREATE VIRTUAL TABLE items_fts USING fts5(name, description, tags, attrs,
                                          tokenize='trigram remove_diacritics 1');
```

Notes

- "Overdue" is computed (`status = 'out' AND due_on < today` in Europe/Berlin), not stored.
- Indexes: `items(owner_kind, owner_id)`, `items(type_id)`,
  `items(location_id)`, `items(barcode)`, `loans(status, due_on)`.
- Attribute filters use `json_extract(attributes, '$.size')`; a hot attribute
  can get a generated column + index.
- Every edit sends `version`; a stale one is rejected as a conflict, so two
  phones can't silently overwrite each other.
- Attachments are content-addressed on disk (`uploads/ab/cd/<sha256>`) and
  served only through an authorized route, so money and private-item rules
  cover photos and receipts too.

---

## 7. Tech stack and architecture

| Concern | Choice | Notes |
| --- | --- | --- |
| Runtime | **Bun 1.4** | Also package manager, test runner, script runner |
| Framework | **TanStack Start** (Solid, SSR) | File routes; `createServerFn` for UI data; server routes for `/api/v1/*`, `/q/:code`, `/files/:id` |
| Data fetching | TanStack Query | Router loaders; optimistic updates for check-out and stock ± |
| Forms | TanStack Form + Zod | Dynamic forms from field definitions |
| Lists | TanStack Table + Virtual | Grid or list, column picker per type |
| Database | SQLite via **`bun:sqlite`** + **Drizzle** | WAL; `drizzle-kit` migrations run at startup |
| Auth | **Better Auth** | Username + password (no email), **passkeys** (real domain + HTTPS), invite-only |
| UI | Tailwind CSS 4 + Kobalte | Accessible, phone-friendly |
| PWA | `vite-plugin-pwa` | Install, offline shell, Web Push service worker |
| Images | `sharp` | WebP thumbnails, EXIF strip, auto-rotate |
| Scanning | Native `BarcodeDetector` | Manual entry fallback (§5) |
| QR generation | `qrcode` | SVG label sheets |
| Language | Paraglide JS, one German catalog | English could be added without touching components; `Intl` de-DE for dates, numbers, € |
| Email / push | `nodemailer` (SMTP) + `web-push` | Outbound only |
| Jobs | `jobs` table + in-process worker | Reminders, thumbnails, low stock; no Redis |
| Quality | `bun test`, Playwright, Biome | Permission matrix tests on every commit |

**Watch-outs**

- TanStack Start is young: pin exact versions, upgrade on purpose.
- Smoke-test `sharp` and `web-push` in the production image (the `Dockerfile`
  does this for `sharp`).
- `bun:sqlite` is synchronous; slow work (thumbnails, bulk import) goes through
  the job worker.

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

**API sketch** (server routes for scripts and export; the UI uses server
functions with the same authz)

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

Scripts authenticate with personal API tokens (hashed, scoped read or write),
reachable only over the VPN.

---

## 8. Deployment: VPN-only with our own domain

Setup steps: [docs/PHASE0.md](docs/PHASE0.md). Operations: [README.md](README.md).

### 8.1 How it works

1. **Tailscale** runs as a sidecar container and joins the tailnet as node
   `hausmeister` with a fixed IP (`100.x.y.z`).
2. **DNS**: `example.de` stays at Strato (nameservers, website, mail). Strato's
   DNS has no API, so the subdomain `sub` is delegated to `ns1.desec.io` /
   `ns2.desec.org`; the zone `sub.example.de` lives at **deSEC** and is set up
   by `deploy/host/desec-setup.sh`.
   - `sub.example.de A <tailnet IP>`, **no AAAA**. The name resolves publicly,
     but the address is reachable only inside the tailnet. No split DNS needed.
3. **TLS**: Let's Encrypt can't reach the server over HTTP, so Caddy uses
   **DNS-01** (`caddy-dns/desec`) and gets a trusted certificate, which
   passkeys, PWA install and Web Push need. Renewal is automatic.
   - The Caddy token is restricted by deSEC token policy to writing
     `_acme-challenge.sub.example.de` TXT only, optionally locked to the VPS IP.
     A leaked token can't change the A record and never had access to `example.de`.
   - Caddy uses the Let's Encrypt staging CA until `ACME_CA` is set.
4. **Mail lock-down**: the subdomain sends and receives no mail and says so:
   ```
   sub.example.de          TXT  "v=spf1 -all"
   _dmarc.sub.example.de   TXT  "v=DMARC1; p=reject"
   sub.example.de          MX   0 .          (null MX, RFC 7505)
   ```
   Reminder email, if enabled, goes through an existing mailbox (§8.6).
5. **Caddy shares the Tailscale container's network namespace**, so it listens
   only on the tailnet. No host ports are published, which also avoids Docker
   bypassing `ufw`.

Tailscale's own certificates and `tailscale serve` only cover `*.ts.net`,
hence Caddy + DNS-01 for the custom domain.

### 8.2 Files

| File | Contents |
| --- | --- |
| `deploy/compose.yaml` | `tailscale`, `caddy` (in tailscale's netns), `app`, `litestream`, one-shot `restic` (profile `tools`) |
| `deploy/caddy/Dockerfile` | Caddy built with `caddy-dns/desec` |
| `deploy/Caddyfile` | DNS-01 via deSEC, `ACME_CA` (staging default), HSTS and security headers, 25 MB body limit |
| `Dockerfile` | App image; installs `sharp` as a real package and smoke-tests it |
| `deploy/litestream.yml` | SQLite replication to B2, intervals sized for the B2 free tier |
| `deploy/.env.example`, `deploy/.env.backup.example` | Secrets and B2/restic settings |
| `deploy/host/` | `bootstrap.sh` (hardening, Docker), `desec-setup.sh`, `install-timers.sh`, `tailscale-policy.hujson` |
| `deploy/check-dns.sh`, `backup-uploads.sh`, `restore-test.sh` | DNS check, nightly restic run, restore test |

SMTP and VAPID settings join `compose.yaml` with reminders (v1.2).

### 8.3 Tailscale

- Family members install Tailscale on phone and laptop and join the family
  tailnet; others get the node **shared** to their own account.
- Policy: `deploy/host/tailscale-policy.hujson`. `group:family` and shared
  users get `tcp/udp:443` on `tag:hausmeister`. Admins get `tcp:22` and
  Tailscale SSH (`check`, 12 h) to their **own** host node (`autogroup:self`);
  the tagged sidecar stays 443-only. SSH therefore uses the host's tailnet IP,
  not `sub.example.de`.
- Guests have the app role `guest`.
- **Free Personal plan**: up to 6 users (since April 2026), unlimited devices,
  3 ACL groups (we use one), non-commercial. Guests count as users, so 5 family
  members leave room for **one** in-tailnet guest; share the node with any others.
- Phones can run Tailscale always-on or on demand. With the VPN off, the PWA
  shows a "connect to the VPN" offline page.

### 8.4 Host hardening

- Debian 13 with `unattended-upgrades`. Admin access via **Tailscale SSH**
  (identity-based, no key, no public port); the key-only sshd from
  `bootstrap.sh` (no root login) is the fallback.
- `ufw` denies all inbound, including 22 once Tailscale SSH works (PHASE0
  step 10). Tailscale SSH runs inside the Tailscale daemon and needs no rule.
  The provider console is the emergency way in. Optional: allow UDP 41641 for
  direct (non-relayed) connections.
- App: rate-limited login with lockout, CSRF checks, strict CSP, uploads
  checked by magic bytes, never by extension.
- Session cookies are host-only `__Host-` (`Secure`, `Path=/`, `SameSite=Lax`,
  no `Domain`). Passkey RP ID is `sub.example.de`. HSTS without
  `includeSubDomains`/`preload`.
- The VPN is only the outer wall: guests share the tailnet, so login and
  authorization apply in full.

### 8.5 Backups (3-2-1)

- Litestream replicates SQLite to a private Backblaze B2 bucket (S3 API),
  point-in-time restore, RPO 15 min.
- `restic` backs up `/data/uploads` nightly: 7 daily, 4 weekly, 12 monthly.
- The bucket key is bucket-scoped; deleted versions are kept 30 days.
- Keep `./ts-state`, `.env`, `.env.backup` (and later the VAPID keys) in a
  password manager or encrypted backup. Without them the tailnet identity and
  push subscriptions are lost.
- **Monthly restore test** (`bun run restore-test`): restores into a throwaway
  container, checks `/health` and the item count.
- Admins can also download the full ZIP export.

### 8.6 Operations

- Upgrades, shutdown and CSP: [README.md](README.md#operations). A DB snapshot
  is taken before migrations.
- Monitoring (planned): ping healthchecks.io every 5 minutes (outbound) and
  report Litestream lag.
- **Email is optional.** Invites are links sent by messenger; admins reset
  passwords. Without email only external borrowers miss reminders. To enable
  it, use an existing mailbox's SMTP (e.g. a GMX or Gmail account with an app
  password), not `sub.example.de`, so §8.1's lock-down stays.

---

## 9. UI map

- **Home**: search, "Scan", transfer offers, pending loan requests, lent out (overdue first), my loans, low stock.
- **Loans** (`/loans`): the same lists in full, offers made; **contacts** (`/contacts`) for external borrowers. **Inbox** (`/notifications`) behind the header badge.
- **Items**: grid or list, faceted filters, saved views ("Winter clothes").
- **Item detail**: photos, fields, location breadcrumbs, owner, current holder,
  related parts, history; actions borrow, move, transfer, print label.
- **Add item**: type → dynamic form; scan a barcode or ISBN to fill fields.
- **Locations**: tree browser ("Garage → Shelf 2").
- **Scan**: full-screen camera; a hit opens the item or location with quick actions (check out, return, ±stock). **Shelf mode** (`/items/shelf`) for books in a row.
- **Labels** (`/labels`): QR label sheets for items and locations, A4 L4732 (with an offset for partly used sheets) or 62 × 29 mm thermal labels.
- **Admin**: users and roles, groups, invites, item types (schema editor with
  live preview), tags, settings, export.
- German only, phone layout first, WCAG AA.

---

## 10. Roadmap

| Phase | Scope |
| --- | --- |
| **0: Infra** ✓ | deSEC zone + restricted token · Strato NS delegation · VPS + Tailscale sidecar · DNS records (A, no AAAA, mail lock-down) · Caddy DNS-01 · Litestream + restic + restore test · "Hallo" page |
| **MVP** ✓ | Invites and login (password + passkey), roles, groups · item types with custom fields and templates · items, locations, containers, photos · visibility, grants, money hiding · search and filters · event log · export |
| **v1.1** ✓ | QR labels and scan mode · ISBN lookup (DNB → Open Library) and shelf mode · loans (internal and external) · stock with low-stock alerts · ownership transfers |
| **v1.2** | PWA + Web Push reminders · optional email (external borrowers) · CSV import · hand-me-downs · warranty expiry · item relations ("fits") |
| **Later** | Offline add queue · personal API tokens · photo search ("what's in this box") |

Phase 0 came first because VPN, DNS and TLS were the likeliest surprises.

---

## 11. Testing focus

- **Authorization is the riskiest part.** Table-driven tests cover every
  role × ownership × visibility × grant combination; a property test checks
  `visibleItemsWhere` against `itemLevel`; serialization tests check that money
  fields and receipts never leave the server below `edit`. Items the caller
  can't see answer **404, never 403**, so their existence isn't revealed.
- Schema tests: the Zod schema from field definitions accepts and rejects the
  right values; legacy fields keep working.
- E2E (Playwright, phone viewport): add an item with a photo, scan → check
  out, loan request → approve.
- The backup restore test runs in CI against a sample dataset.

---

## 12. Open questions

None.

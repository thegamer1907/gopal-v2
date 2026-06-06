# Data Model

The evolving SQLite schema. Update this whenever a table/field/relationship changes, and
keep it in sync with the Go DB layer.

> **Status:** Item master in active design. Broader domain (stock levels, suppliers,
> purchase bills, transactions, etc.) still to be defined and captured here.

> **Iteration policy (current phase):** we are **not** maintaining incremental migrations
> yet — the schema is changing too fast. Edit the schema in `internal/db/migrate.go`
> directly. Because the existing migration is marked applied, a schema change won't reapply
> to an existing dev DB: **delete the dev DB file to reset it** (macOS:
> `~/Library/Application Support/gopal-v2/inventory.db`; Windows:
> `%APPDATA%\gopal-v2\inventory.db`). Real, additive migrations come later, before there's
> data worth preserving.

---

## Tables

### `items` — item master (product catalog)
The list of products we deal in. **Primary key is the composite `(name, pack_size)`** — no
surrogate id. Display labels in parentheses.
| Column | Type | Notes |
|--------|------|-------|
| `name` | TEXT NOT NULL | the item name (label: **Item**) — part of PK |
| `pack_size` | REAL NOT NULL DEFAULT 0 | numeric pack size, e.g. 100 (label: **Pack Size**) — part of PK |
| `gst_percent` | REAL NOT NULL DEFAULT 0 | GST rate %, e.g. 18 (label: **GST %**) |
| `hsn` | INTEGER NOT NULL DEFAULT 0 | HSN code, numeric (label: **HSN**) |

PRIMARY KEY: `(name, pack_size)`.

> Go: `db.Item` + `AddItem`/`ListItems` in `internal/db/items.go`. The Go `AddItem`
> signature and the Wails bindings mirror these types (`packSize`/`gstPercent` numbers,
> `hsn` number). The Items **UI is intentionally out of sync** right now (still references
> the old shape) — to be updated in a later UI pass.

### `purchase_bills` — purchase bill header
One row per bill (from the Add Purchase Bill form: Company, Bill number, Date).
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | surrogate key (FK target for line items) |
| `company` | TEXT NOT NULL | supplier / company name |
| `bill_number` | TEXT NOT NULL | the supplier's bill number |
| `date` | TEXT NOT NULL | bill date, stored as entered: `dd/mm/yyyy` |

### `purchase_bill_items` — purchase bill line items
One row per item line on a bill. Links to its parent bill and to an item in the master.
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | surrogate key |
| `bill_id` | INTEGER NOT NULL | → `purchase_bills(id)`, `ON DELETE CASCADE` |
| `item_name` | TEXT NOT NULL | part of composite FK → items |
| `item_pack_size` | REAL NOT NULL | part of composite FK → items |
| `tax_qty` | REAL NOT NULL DEFAULT 0 | **Tax Qty** |
| `tax_value` | REAL NOT NULL DEFAULT 0 | **Tax Value** |
| `d_qty` | REAL NOT NULL DEFAULT 0 | **D-Qty** |
| `d_value` | REAL NOT NULL DEFAULT 0 | **D-Value** |
| `discount` | REAL NOT NULL DEFAULT 0 | **Discount** (numeric) |
| `remarks` | TEXT NOT NULL DEFAULT '' | **Remarks** |

Foreign keys: `(bill_id)` → `purchase_bills(id)` ON DELETE CASCADE;
`(item_name, item_pack_size)` → `items(name, pack_size)`. FK enforcement is on
(`_pragma=foreign_keys(1)` in `internal/db/db.go`).

> Go: `db.PurchaseBill` + `db.PurchaseBillItem` and `AddPurchaseBill` (transactional
> header + lines insert) in `internal/db/purchase_bills.go`; exposed via `app.go`. The
> calculated columns (GST amount, totals, final rates) are **derived on the frontend and
> not stored**. Discount is stored but currently unused by any formula.

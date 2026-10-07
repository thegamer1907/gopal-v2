# Data Model

The evolving SQLite schema. Update this whenever a table/field/relationship changes, and
keep it in sync with the Go DB layer.

> **Migration policy — the client has real, irreplaceable data now (since ~2026-06).**
> This distinction matters and has bitten adjacent projects before, so read it before
> touching `internal/db/migrate.go`:
>
> - **Additive changes are always safe and need no manual step.** A new table, or a new
>   column with a `DEFAULT`, just gets appended to the `migrations` slice. The runner
>   (`internal/db/migrate.go`, tracked via `schema_migrations`) applies only what's new,
>   automatically, the next time *any* copy of the app opens the database — the client's
>   real production DB included. It never touches existing tables or rows. This is exactly
>   how the `customers` table was added (2026-09-26): the client updated, got an empty
>   `customers` table, and every existing company/item/bill was untouched. **Never tell the
>   client to delete or wipe their database for a change of this kind — there is nothing
>   for them to do.**
> - **"Wipe the dev DB"/"delete `inventory.db`" is a local-development convenience only**
>   — for quickly iterating on a migration's shape on *your own machine* before it ships,
>   while a table has no data worth keeping yet. It is never something to suggest for the
>   client's database now that it holds real bills/companies/items/customers.
> - **A genuinely breaking change — renaming, retyping, or dropping an existing column —
>   is a different situation entirely.** `CREATE TABLE IF NOT EXISTS` can't rescue data out
>   of a column that's disappearing. That needs a real, hand-written migration that copies/
>   transforms the existing rows in place (or an explicit, upfront conversation with the
>   client about what would be lost) — not a slice append, and never a wipe. Flag this
>   loudly and get sign-off before writing anything shaped like that.

---

## Storage location & config
The DB file location is **user-configurable** (Settings → Database). On startup the app opens
the path from **`config.json`** if set, otherwise the default `inventory.db`:

- `config.json` (next to the default DB, e.g. `~/Library/Application Support/gopal-v2/config.json`)
  holds `{ "dbPath": "<absolute path>" }`. Empty/missing → use the default.
- Resolution: `db.ActivePath()` → configured `dbPath` or `db.DefaultPath()`; opened via
  `db.OpenAt`. If the configured path fails to open, startup **falls back to the default** and
  resets the config (a bad saved path can't brick the app). See `internal/db/config.go`,
  `app.go` (`startup`, `switchTo`, `WipeDatabase`) and `docs/DECISIONS.md`.

---

## Tables

### `items` — item master (product catalog)
The list of products we deal in. **An item belongs to a company** (`company_id` FK).
Surrogate `id` PK (so bill lines FK to it); `(company_id, name, pack_size)` is unique within a
company — the same item name can exist under different companies.
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | surrogate key (FK target for bill lines) |
| `company_id` | INTEGER NOT NULL | → `companies(id)` (FK) — the owning company |
| `name` | TEXT NOT NULL | the item name (label: **Item**) |
| `pack_size` | REAL NOT NULL DEFAULT 0 | numeric pack size, e.g. 100 (label: **Pack Size**) |
| `gst_percent` | REAL NOT NULL DEFAULT 0 | GST rate %, e.g. 18 (label: **GST %**) |
| `hsn` | INTEGER NOT NULL DEFAULT 0 | HSN code, numeric (label: **HSN**) |

UNIQUE: `(company_id, name, pack_size)`. Foreign key: `(company_id)` → `companies(id)`.
Created **after** `companies` (FK target).

> Go: `db.Item` (`id`, `companyId`, read-only `companyName` via JOIN, name, packSize,
> gstPercent, hsn, read-only `stock`) + `AddItem(companyID, …)` / `ListItems` (all, JOIN
> company name) / `ListItemsByCompany(companyID)` in `internal/db/items.go`. UI: Items
> master page has a company picker + Company column; the bill fetches items **for the
> selected company**.
>
> **`stock` is derived, not a column** — `itemSelect`'s query computes it per row via
> correlated subqueries: total purchased (`tax_qty + d_qty` summed across
> `purchase_bill_items`) minus total sold (`qty` summed across `sales_order_items`) for
> that item. Every caller of `ListItems`/`ListItemsByCompany` gets it for free (no
> separate lookup) — shown on the Items master table and on Add Order once a line's item
> is picked. `AddItem`/`UpdateItem`'s returned struct leaves it at the zero value (same as
> `companyName` already is there) — a brand-new item has no history yet regardless, and an
> edited item's real figure is picked up the next time the list is re-fetched.

### `companies` — company master
The list of companies bills can be raised against. **Surrogate `id` PK** (so bills FK to it
and survive renames); `name` is unique. Just those two columns for now; more to follow.
Created **first** (migration id 1) so it's a valid FK target for `items` and `purchase_bills`.
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | surrogate key (FK target for bills) |
| `name` | TEXT NOT NULL UNIQUE | company name (label: **Company**) |

> Go: `db.Company` (`id`, `name`) + `AddCompany`/`ListCompanies` in `internal/db/companies.go`;
> exposed via `app.go`. UI mirrors the Items pattern: a master page (`/companies`) plus a
> `CompanyCombobox` + `NewCompanyDialog` for picking/adding inline on the bill header.

### `purchase_bills` — purchase bill header
One row per bill (from the Add Purchase Bill form: Company, Bill number, Date).
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | surrogate key (FK target for line items) |
| `company_id` | INTEGER NOT NULL | → `companies(id)` (FK). The bill references the company by id, not name. |
| `bill_number` | TEXT NOT NULL | the supplier's bill number |
| `date` | TEXT NOT NULL | bill date, stored exactly as entered/unvalidated (never rewritten). Current format is `dd-mmm-yy` (e.g. `09-Jun-26`); bills saved before 2026-09 are stored as the older `dd-mmm-yyyy`. `@/lib/date`'s `parseDate` accepts both permanently, and `displayDate` normalizes any stored string to the current form for display — no migration of old rows. |

Foreign key: `(company_id)` → `companies(id)`.

### `purchase_bill_items` — purchase bill line items
One row per item line on a bill. Links to its parent bill and to an item in the master.
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | surrogate key |
| `bill_id` | INTEGER NOT NULL | → `purchase_bills(id)`, `ON DELETE CASCADE` |
| `item_id` | INTEGER NOT NULL | → `items(id)` (FK). Item name/pack/GST are read back via a JOIN, not stored. |
| `tax_qty` | REAL NOT NULL DEFAULT 0 | **Tax Qty** |
| `tax_value` | REAL NOT NULL DEFAULT 0 | **Tax Value** |
| `d_qty` | REAL NOT NULL DEFAULT 0 | **D-Qty** |
| `d_value` | REAL NOT NULL DEFAULT 0 | **D-Value** |
| `discount` | REAL NOT NULL DEFAULT 0 | **Discount** (numeric) |
| `remarks` | TEXT NOT NULL DEFAULT '' | **Remarks** |

Foreign keys: `(bill_id)` → `purchase_bills(id)` ON DELETE CASCADE; `(item_id)` →
`items(id)`. FK enforcement is on (`_pragma=foreign_keys(1)` in `internal/db/db.go`).

> Go: `db.PurchaseBill` carries `companyId` (written) plus a read-only `companyName`
> (JOIN to `companies` on read). `db.PurchaseBillItem` carries `itemId` (written) plus
> read-only `itemName` / `itemPackSize` / `gstPercent` (JOIN to `items` on read).
> `AddPurchaseBill` (transactional header + lines insert) and `ListPurchaseBills` (all bills +
> lines, newest first; JOINs `companies` and `items`) in `internal/db/purchase_bills.go`;
> exposed via `app.go`. The calculated columns (GST amount, totals, final rates) are **derived
> on the frontend and not stored** (shared helper `frontend/src/lib/purchaseBill.ts`), using
> the item's *current* name/pack/GST from the JOIN. Discount is stored but currently unused by
> any formula.

### `customers` — customer master (first piece of the Order Book / Sales feature)
The list of customers `sales_orders` are raised against (migration id 5).
Surrogate `id` PK; `name` is **not** unique (unlike `companies` — two customers may share a
display name). Only `name` and `city` are required by the app; every other column
defaults to `''` so a partially-filled customer saves cleanly.
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | surrogate key |
| `name` | TEXT NOT NULL | customer name (label: **Name**) — required |
| `nick_name` | TEXT NOT NULL DEFAULT '' | (label: **Nick Name**) |
| `address1` | TEXT NOT NULL DEFAULT '' | (label: **Address 1**) |
| `address2` | TEXT NOT NULL DEFAULT '' | (label: **Address 2**) |
| `city` | TEXT NOT NULL DEFAULT '' | (label: **City**) — required |
| `state` | TEXT NOT NULL DEFAULT '' | one of the 28 Indian states / 8 union territories (`frontend/src/lib/indianStates.ts`); plain text, not a lookup table — the list is small and effectively static |
| `pincode` | TEXT NOT NULL DEFAULT '' | stored as text (an identifier, not a quantity) |
| `gstin` | TEXT NOT NULL DEFAULT '' | no format validation |
| `mobile` | TEXT NOT NULL DEFAULT '' | stored as text |

`sales_orders.customer_id` now references `customers(id)` — `DeleteCustomer` is guarded
the same way as `DeleteCompany`/`DeleteItem` (refuses with a friendly count when any sales
order still uses the customer).

> Go: `db.Customer` (all 10 fields) + `AddCustomer`/`UpdateCustomer`/`DeleteCustomer`/
> `ListCustomers` (ordered by name) in `internal/db/customers.go`, passed as a whole struct
> (not flat params, since there are 9 editable fields) — exposed via `app.go`. UI: a
> Companies/Items-style master page (`/customers`) with a **`StateCombobox`**
> (type-to-filter, mirrors `CompanyCombobox`) populated from `INDIAN_STATES` — not a plain
> dropdown (an earlier shadcn `Select` was replaced with this per client feedback).

### `sales_orders` — sales order header (first piece of the Order Book / Sales feature)
One row per order (from the Add Order form: Customer, Date). No order number at entry time
— the internal `id` is the only identifier until the order is delivered, at which point it
also gets a sequential `delivery_number`. Migration id 6; `delivered` added in migration id
8, `delivery_number` in id 10 (backfilled by id 11).
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | surrogate key (FK target for line items) |
| `customer_id` | INTEGER NOT NULL | → `customers(id)` (FK) — the order references the customer by id, not name |
| `date` | TEXT NOT NULL | order date, same `dd-mmm-yy` convention/handling as `purchase_bills.date` |
| `delivery_number` | INTEGER NOT NULL DEFAULT 0 | **the source of truth for delivery status.** `0` = not yet delivered (every existing/new order defaults here); anything above `0` is the order's sequential delivery number, assigned once by `MarkSalesOrderDelivered` and never cleared. Deliberately **not** UNIQUE — see the numbering note below |
| `delivered` | INTEGER NOT NULL DEFAULT 0 | **legacy mirror, kept only for backward compatibility.** Set to `1` in the same statement that assigns `delivery_number`, so it can never contradict it, but Go no longer reads it — `SalesOrder.Delivered` is derived as `delivery_number > 0`. It exists because the in-app updater keeps one generation of rollback: a client who reverts to a pre-`delivery_number` build reads this column and still sees correct delivery status. Not dropped, because dropping a column is a breaking change under the migration policy above |

Foreign key: `(customer_id)` → `customers(id)`.

### `sales_order_items` — sales order line items
One row per item line on an order. Links to its parent order and to an item in the master.
Migration id 7; `custom_pack_size` added in migration id 9.
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | surrogate key |
| `order_id` | INTEGER NOT NULL | → `sales_orders(id)`, `ON DELETE CASCADE` |
| `item_id` | INTEGER NOT NULL | → `items(id)` (FK). Item name/pack size/GST %/HSN are read back via a JOIN, not stored |
| `rate` | REAL NOT NULL DEFAULT 0 | **Rate**, entered by the user |
| `qty` | REAL NOT NULL DEFAULT 0 | **Qty**, entered by the user |
| `custom_pack_size` | REAL NOT NULL DEFAULT 0 | `0` = no override, use the item's master pack size. Set when a specific carton on this line was physically packed differently than standard (e.g. 18 instead of a standard 20) |

Foreign keys: `(order_id)` → `sales_orders(id)` ON DELETE CASCADE; `(item_id)` →
`items(id)`.

> Go: `db.SalesOrder`/`db.SalesOrderItem` + `AddSalesOrder` / `ListSalesOrders` /
> `GetSalesOrder` / `UpdateSalesOrder` / `UpdateDeliveredSalesOrder` / `DeleteSalesOrder` /
> `MarkSalesOrderDelivered` in `internal/db/sales_orders.go`
> (each a direct structural mirror of `purchase_bills.go`'s equivalent — same
> transactional delete-and-reinsert shape for Update, same two-query header-then-lines
> shape for List/Get); exposed via `app.go`. **Final Amount** (rate × qty × pack size) is
> derived on the frontend and not stored (shared helper `frontend/src/lib/salesOrder.ts`),
> same pattern as Purchase Bill's calculated columns.
>
> **Delivery is one-way** (this supersedes the original reversible toggle — see
> DECISIONS.md). `MarkSalesOrderDelivered(id)` is a single statement, kept separate from
> the whole-row `UpdateSalesOrder` overwrite:
>
> ```sql
> UPDATE sales_orders
>    SET delivery_number = (SELECT COALESCE(MAX(delivery_number), 0) + 1 FROM sales_orders),
>        delivered = 1
>  WHERE id = ? AND delivery_number = 0
> ```
>
> One statement rather than read-then-write because the pool isn't pinned to a single
> connection; `AND delivery_number = 0` is what enforces irreversibility in SQL, so a second
> attempt matches no rows and errors. It's called directly from a button in the `/orders`
> list row and one on the order's edit page (`AddOrder.tsx`), both behind a confirmation
> dialog, and both bypassing the edit form's Save/dirty-tracking flow.
>
> **Numbering** is `MAX + 1`, so numbers can have gaps (delivered orders can still be
> deleted) and the number of a deleted *highest* order is reused by the next mark. Both are
> accepted — single-user app, and the number is in-app only, never shown to the customer —
> which is also why `delivery_number` carries no UNIQUE index: it would hard-fail that
> legitimate reuse.
>
> **A delivered order is frozen apart from Qty and Rate.** `UpdateSalesOrder` reads
> `delivery_number` as the first statement in its transaction and refuses outright if it's
> set, so the whole-row overwrite (and its `DELETE FROM sales_order_items`) can never reach
> a delivered order. The only write path for one is `UpdateDeliveredSalesOrder`, which
> verifies customer, date, line count, and each line's `item_id`/`custom_pack_size` against
> the stored row before issuing a targeted `UPDATE ... SET rate = ?, qty = ?` per line.
> Lines are matched positionally against rows read back in `id` order (the same order every
> read returns), so the row ids never leave `internal/db` and a reordered payload is
> rejected rather than misapplied.
>
> **Custom pack size** is a per-line write, not JOIN-derived (unlike `ItemPackSize`),
> and deliberately does **not** change how `calcOrderLine` works — it's fed the
> *effective* pack size (`lib/salesOrder.ts`'s `effectivePackSize`: custom-if-set-else-
> master) as its ordinary `packSize` input, on every on-screen screen that shows a line
> (Add/Edit Order, Order detail, the orders list's Final Amount column) — totals are
> correct automatically, no separate on-screen deduction bookkeeping. **Exports only**
> (image/Excel/PDF) re-present this: `buildOrderExportGroups` (same file) groups lines by
> `(itemId, rate)` into one row shown at the item's **standard** pack size (gross, as if
> every carton were standard) plus a `"Less: N unit — Item Name"` line (or `"Add: ..."`
> when the custom size was *larger* than standard) per line that had a custom pack size,
> netting to the same true total via a second, final "Total" row. Stock (purchased minus
> sold) is tracked at the carton level and is entirely unaffected by this — confirmed
> with the client, no changes made to that derivation.
>
> **`CustomerNickName`/`CustomerCity`** are JOIN-populated onto `SalesOrder` the same way
> as `CustomerName` (read-only, ignored on write) — added for the "Copy Order Image" share
> feature's header line (`{nickname||name} - {city}`), but available to any future reader
> that wants them without a second customer lookup.
>
> **"Copy Order Image"** (order detail view) renders the order as a PNG via
> `frontend/src/components/ShareableOrderImage.tsx` (`html-to-image`, client-side only)
> and copies it straight to the clipboard for the user to paste into WhatsApp — the app
> never opens WhatsApp or constructs a message itself (a `wa.me` link can only pre-fill
> text, never attach a file, so there's nothing useful to automate beyond the copy). If
> the clipboard write fails, `App.SaveOrderShareImage(png []byte, defaultFilename string)`
> (`app.go`) is the fallback — a plain `SaveFileDialog` + `os.WriteFile`, same shape as
> `ExportPurchaseSummary`. No new table, no migration.
>
> **"Download Excel"/"Download PDF"** (same order detail view, beside "Copy Order
> Image") export the same customer-facing content (no GST%/HSN) as real files instead of
> a clipboard image. `internal/reports/order_export.go` — `OrderExportHeader` +
> `OrderExportRow` + `OrderExportDeduction` (all three built by the frontend:
> `SavedOrders.tsx`'s `toExportHeader`/`toExportRowsAndDeductions`, reusing
> `customerShareLabel`/`buildOrderExportGroups` from `lib/salesOrder.ts`) —
> `WriteOrderExcel` (`excelize`, styled to match `ShareableOrderImage.tsx`'s
> yellow/bordered look, unlike the plainer `WritePurchaseSummary` convention) and
> `WriteOrderPDF` (`github.com/signintech/gopdf`, hand-drawn cells — the library's
> convenience `NewTableLayout` API can't do the merged header row or per-cell borders
> this layout needs). Both now render a gross "Total" row, then (only when deductions is
> non-empty) one "Less"/"Add" line per custom-pack-size line and a final net "Total" row.
> PDF text uses a bundled Nunito TTF (`internal/reports/fonts/`, SIL OFL license,
> embedded via `go:embed` — gopdf has no built-in fonts). `App.ExportOrderExcel`/
> `ExportOrderPDF` (`app.go`) mirror `ExportPurchaseSummary`'s SaveFileDialog + write
> pattern exactly. No new table, no
> migration. See DECISIONS.md for the gopdf `SetTextColor` gotcha and the Excel
> Indian-grouping limitation.
>
> **Rate history is derived, not a separate table**: `db.RateHistoryEntry` +
> `RateHistory(customerID, itemID)` (same file) answers "what did this customer last pay
> for this item" straight from `sales_order_items` JOINed to `sales_orders` — every past
> order already *is* the history, so nothing is duplicated/kept in sync separately. Since
> `date` is free text, the query only orders by `id` as a cheap tie-break; the frontend
> sorts by parsed date (`AddOrder.tsx`, `RateHistoryDialog.tsx`) — same reasoning as every
> other date sort in this app.

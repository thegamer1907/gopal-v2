# Features

The backlog, grouped by status. When a feature moves to **Planned**, give it a short
spec (what it does, key behaviors). Move items between sections as work progresses:
**Idea → Planned → In Progress → Shipped** (or → Rejected, with a reason).

---

## Shipped
_Shipped in **v0.7.0** (2026-09-28): order **delivered status** (reversible toggle,
list-row + edit-page buttons, "Show delivered" filter); **Copy Order Image** (WhatsApp
sharing via clipboard); **Download Excel/PDF for orders**; **custom pack size** per
order line (editable Pack Size, "Less"/"Add" export reformatting). See DECISIONS for the
notable technical calls in each._

_Patch after v0.6.0 (2026-09-27): five client-reported fixes — Add Order item-search
duplicate-row bug, Excel report number formatting (whole-number quantities, real GST %
percentage format), a wider two-line Add Order item dropdown, Customer state field not
saving free-typed text, and the top-nav wrap-spacing glitch on narrow windows. See
DECISIONS for detail on each._

_Shipped in **v0.6.0** (2026-09-27): the **Sales / Order Book** feature — Customers
master, Add Order (+ item stock, per-customer rate history), View/Edit Orders — plus the
`dd-mmm-yy` date format. v0.5.0 (2026-09-20): in-app self-update (Settings → Updates).
v0.4.0 (2026-09-20): **Reports** page + Purchase Summary Excel export.
v0.3.0 (2026-06-15): masters edit/delete, sortable + filterable tables with a
date-range filter, Indian (en-IN) number formatting, the reworded unsaved-changes dialog, and the
**top-nav redesign** (sidebar → flat top bar). v0.2.1 (2026-06-10): Company master,
items-belong-to-company, View/Edit Bills (edit/delete), Settings/DB management, batch-1 polish._

- **Download Excel / Download PDF for orders** — two more buttons beside "Copy Order
  Image" (order detail view) so an order can be saved as a file, not just copied to the
  clipboard. Same customer-facing content/style as the WhatsApp image (Qty/Item/Unit/
  Rate/Amount, yellow header/footer, black-bordered grid) rendered as real documents:
  `internal/reports/order_export.go`'s `WriteOrderExcel` (`excelize`) and `WriteOrderPDF`
  (new dependency `github.com/signintech/gopdf`, hand-drawn cells, bundled Nunito TTF
  font — the library has no built-in fonts). `App.ExportOrderExcel`/`ExportOrderPDF`
  mirror `ExportPurchaseSummary`'s native-Save-dialog pattern. Known cosmetic gap: the
  Excel export's totals use Western 3-digit grouping (Excel's `#,##0.00` format has no
  Indian-grouping option — same limitation the existing Purchase Summary export already
  has), while the PDF and image both show true Indian grouping (computed as plain text).
- **Custom pack size per order line** — a line's Pack Size field on Add/Edit Order is
  now editable (defaults to the item's master pack size, same as before) instead of
  read-only, for the rare case a specific carton is physically packed differently than
  standard (e.g. 18 instead of 20). Enter it as a **second line** for the odd carton(s)
  — the app already allows the same item on multiple lines. A small "Custom" badge marks
  any line whose pack size differs from master, in both Add/Edit Order and the read-only
  Order detail view. On-screen totals need no special handling — each line's own amount
  already uses its own (custom-if-set) pack size, so everything nets out automatically.
  **Exports only** (Copy Order Image / Download Excel / Download PDF) re-present this
  the way the client's reference image does: lines for the same item+rate are combined
  into one row shown at the standard pack size (gross), followed by the gross Total,
  then a `"Less: N unit — Item Name"` line per custom-pack-size line (or `"Add: ..."` if
  the custom size was larger than standard), and a final net Total. Stock tracking is
  unaffected (carton-level, confirmed with the client). Backend: `custom_pack_size`
  column on `sales_order_items` (migration id 9); export grouping/deduction logic lives
  once in `frontend/src/lib/salesOrder.ts` (`buildOrderExportGroups`), reused by the
  image, Excel, and PDF.
- **Copy Order Image (WhatsApp sharing)** — new "Copy Order Image" button on the order
  detail view (`/orders`, `OrderDetail`). Renders the order as a PNG in a purpose-built,
  customer-facing layout (`ShareableOrderImage.tsx`: yellow header/footer bars,
  black-bordered grid, header line `{customer nickname or name} - {city}` + date,
  columns Qty/Item/Unit(pack size)/Rate/Amount, bold total row — no GST%/HSN, and no
  packaging-type column since that's not tracked data; compact sizing — 11px font,
  tight `2px 6px` cell padding — so more line items fit in a smaller image) and copies it
  straight to the
  clipboard for pasting into a WhatsApp chat. The app never opens WhatsApp or builds a
  message itself — WhatsApp has no way to auto-attach a file via a link, so a manual
  paste is the whole interaction. Falls back to a native Save Image dialog only if the
  clipboard write itself fails (`navigator.clipboard.write()` is called synchronously
  with the click, handed a still-pending render promise, since Safari/WebKit revokes the
  click's clipboard permission across an earlier `await`). Backend:
  `App.SaveOrderShareImage` (`app.go`, fallback only) + `CustomerNickName`/`CustomerCity`
  added to `db.SalesOrder` (`internal/db/sales_orders.go`). Verified working on macOS
  (`wails dev`); clipboard-write behavior on the shipping Windows/WebView2 target is
  unverified — untested there, falls back to Save-dialog if it doesn't work.
- **Order delivered status** — new `delivered` column on `sales_orders` (migration id 8,
  defaults `false`/not-delivered for every existing and new order). Reversible toggle,
  markable from two places: an inline icon button per row in the `/orders` list table
  (`SavedOrders.tsx`) and a "Mark delivered" / "Mark not delivered" button on the order's
  edit page (`AddOrder.tsx`, next to the "Edit order" heading) — both call the new
  `SetSalesOrderDelivered` method directly, independent of the edit page's own Save flow.
  The `/orders` list shows **only undelivered orders by default**, with a "Show delivered"
  `Switch` in the toolbar to include them; when shown, each row (and the read-only detail
  view) carries a Delivered/Pending `Badge`. `UpdateSalesOrder` deliberately never touches
  `delivered`, so saving unrelated order edits can't reset it. Backend:
  `SetSalesOrderDelivered` in `internal/db/sales_orders.go` + `app.go`. First use of a
  boolean column, and first `switch`/`badge` shadcn components, in this codebase.
- **Customers master** (first piece of the **Sales / Order Book** feature) — new
  `/customers` page: add/edit/delete customers (Name, Nick Name, Address 1/2, City, State,
  Pincode, GSTIN, Mobile). Only **Name and City are required**; everything else can be
  filled in later. **State** is a type-to-filter combobox (`StateCombobox`, mirrors
  `CompanyCombobox`) over the 28 Indian states + 8 union territories, not free text and
  not a plain dropdown. List table shows every field, with Address 1/2 merged into one
  Address column. **Delete is reference-guarded** — refuses with a friendly count once a
  sales order uses the customer. Backend: `internal/db/customers.go`
  (`AddCustomer`/`UpdateCustomer`/`DeleteCustomer`/`ListCustomers`, passed as a whole
  `db.Customer` struct).
- **Add Order** (second piece of Sales / Order Book) — new `/orders/new` page, closely
  mirroring Add Purchase Bill: a Customer header (`CustomerCombobox`, filters by
  name/nickname/city; quick-add reuses `EditCustomerDialog`'s new create mode) + Date,
  then line items with a **global** item search (`ItemCombobox`, now cross-company via a
  new `showCompany` display flag) — **disabled until a customer is chosen** — showing
  Pack Size/GST %/HSN/**Stock** read-only, user-entered Rate and Qty, and a calculated
  **Final Amount** (`Rate × Qty × Pack Size`, `lib/salesOrder.ts`). **Rate auto-prefills
  from the customer's own rate history for that item** (latest past order, blank if none)
  via a derived lookup — no separate history table, just a query over past
  `sales_order_items`/`sales_orders` — plus an info button showing the full
  date-descending history. **Changing the customer after lines have items** prompts to
  recalculate rates for the new customer, keep them as-is, or cancel the switch. Totals
  row sums Qty and Final Amount. No order number (just the internal id). **Also serves as
  the order editor** (`/orders/:id/edit`, see View/Edit Orders below) — same dual-purpose
  component as `AddPurchaseBill.tsx`. Backend: `sales_orders`/`sales_order_items` tables,
  `internal/db/sales_orders.go` (`AddSalesOrder`, `RateHistory`, plus the CRUD listed
  below).
- **Item stock** — a **Stock** column on both Add Order's line items and the Items
  master table: total purchased minus total sold, **derived** on every read (a query
  addition to the existing `itemSelect`, not a new table/column) so it's always current
  and never needs syncing. No over-sell validation — shown for reference only.
- **View/Edit Orders** (third piece of Sales / Order Book) — new `/orders` page, a
  near-verbatim structural copy of View/Edit Bills: list (Customer · Date · Qty · Final
  Amount, sortable, search by customer, date-range filter) → read-only detail (Edit →
  reopens `AddOrder.tsx` in edit mode; Delete → confirm → cascade) → back to the refreshed
  list. No Stock column on the detail view (Stock is for planning a *new* order, not a
  fact about a saved one). Because Stock and rate history are both derived live, editing
  or deleting an order needs no extra sync code — every other screen picks the change up
  automatically. Backend: `ListSalesOrders`/`GetSalesOrder`/`UpdateSalesOrder`/
  `DeleteSalesOrder` in `internal/db/sales_orders.go`, each mirroring the matching
  Purchase Bill function.
- **Date format `dd-mmm-yy`** (2-digit year) — replaced `dd-mmm-yyyy` everywhere a date is
  shown or typed. `parseDate` stays permanently tolerant of the legacy 4-digit form (real
  bills already existed in that format) and `displayDate` normalizes any stored string to
  the current form for display — no data migration.

- **In-app self-update** — new **Updates** section on Settings: shows the running version,
  a **Check for Updates** button (polls the GitHub Releases API), and — when a newer release
  exists — the release notes plus a **Download & Install** button that downloads the new
  `.exe`, verifies it against a published SHA-256 checksum, replaces the running binary
  (`github.com/minio/selfupdate`, one-generation rollback backup), relaunches, and quits.
  Version is embedded at build time via `-ldflags -X main.version=...` in
  `build-windows.yml`. The destructive replace step is hard-guarded to Windows (the only
  platform this app ships on); the check itself is safe to run anywhere, including
  `wails dev`, where it always reports "no update" by design. **v0.5.0 is the first
  release that carries this — the actual replace-and-relaunch mechanic hasn't been
  exercised on real Windows yet; that's the client's plan for this release.**
- **Reports — Purchase Summary** — new `/reports` page (own top-nav link), a card-grid of
  downloadable reports (extensible — more report types are just more cards). First report:
  **Purchase Summary**, a line-item register of every purchase-bill line across a chosen date
  range (or all, when no range is picked), exported as a real `.xlsx` workbook — typed date
  cells (`dd-mmm-yy`) and typed number cells (accounting-style: money 2-decimal + thousands
  separator, quantity/rate-support columns plain 2-decimal, HSN a plain integer), a frozen +
  auto-filtered header, and a bold Totals row. Report math is computed in the frontend (reuses
  `calcLine`, never re-derived) and handed to a new Go method (`ExportPurchaseSummary`, backed
  by `internal/reports` + `excelize`) that only lays it out and saves it via the native
  save-file dialog.

- **App navigation shell** — a **flat, always-visible top navigation bar** (`src/components/TopNav.tsx`):
  wordmark + all page links in one row (currently Dashboard · Add Purchase Bill ·
  View/Edit Bills · Add Order · View/Edit Orders · Items · Companies · Customers ·
  Reports — grows as pages are added) with Settings + Logout on the right; active route
  highlighted. Launches **maximised**; **Logout** quits (confirm). Routing via
  `react-router-dom` (`HashRouter`). (Replaced the original collapsible left sidebar per
  client feedback.)
- **Dashboard (placeholder)** — landing page; centered "Hare Krishna". Real content TBD.
- **Company master** — `companies` (surrogate `id` PK + unique `name`). Companies page under
  *Masters*; picked/created inline on the bill via `CompanyCombobox` + `NewCompanyDialog`.
- **Item master (company-scoped)** — `items` has `id` PK + **`company_id` FK**, unique
  `(company_id, name, pack_size)`. Items page has a company picker + Company column.
- **Add Purchase Bill** — company-first data-entry screen: header (Company combobox, Bill
  number, Date in **dd-mmm-yy**) + searchable line items **fetched per company**, live calc
  columns (GST amt, totals, Final Rate), running totals, add-new-item/company dialogs,
  unsaved-changes guard, centered Save, transactional save.
- **View/Edit Bills** — `/purchase-bills`. List → read-only detail with **Edit** (reopens the
  bill form prefilled; saving = **complete overwrite** via `UpdatePurchaseBill`) and **Delete**
  (confirm → cascade). Backend: `ListPurchaseBills` / `GetPurchaseBill` / `UpdatePurchaseBill`
  / `DeletePurchaseBill`.
- **Settings — Database management** — `/settings`: shows the active DB path; **open existing**
  / **create new** (native dialogs) / **wipe**. Path persists in `config.json` (`db.ActivePath`)
  with fallback to default. Switching/wiping reloads the app.
- **Windows build/release CI** — `.github/workflows/build-windows.yml` builds on
  `windows-latest` and, on a `v*` tag push, publishes a **GitHub Release** with the `.exe`.
  Repo: `github.com/thegamer1907/gopal-v2`.
- **Masters edit/delete** — Items and Companies tables each have per-row **Edit** (dialog reusing
  the add fields; item edit can also move it to another company) and **Delete** (controlled confirm;
  **reference-guarded** in Go — refuses with a friendly count when items/bills/lines still use it).
  Backend: `UpdateItem`/`DeleteItem`, `UpdateCompany`/`DeleteCompany`.
- **Sortable + filterable tables; Indian number format** — all list tables (Items, Companies,
  View/Edit Bills) have clickable **sortable column headers** (`useTableSort` + `SortableHeader`)
  and a **search box**; dated tables get a **date-range filter** (`DateRangeFilter`). The
  **View/Edit Bills** list is reordered to **Company · Date · Bill number · Qty · Amount**
  (Qty = Σ taxQty+dQty), defaults to **newest date first**. Amounts render **Indian-style**
  (`1,20,300.00`) via `fmt`; quantities whole via `fmtQty`.

## In Progress
_None._

## Planned
- **Dashboard content** — decide the real KPIs / lists.
- **As-billed snapshots** — optionally store GST%/name on the bill line so historical bills
  don't shift when the master changes.
- **More Reports cards** — additional report types on `/reports` (e.g. sales/stock summaries),
  each just another card in the same grid.
- **Auto-check for updates on launch** — a silent background check (today's Check for
  Updates button is manual-only, deliberately, per the client's ask).
- **Order number** — whether/how to add one to Sales orders is still open; not needed
  for v1.

## Ideas
_Capture raw feature ideas here as they come up (from us or the client)._

## Rejected
_None yet. When we reject an idea, note it here with a one-line reason._

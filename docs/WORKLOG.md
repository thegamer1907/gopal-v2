# Work Log

Session journal — **newest entry on top**. Each entry: what we did, decisions made, and
explicit next steps. This is the primary "start where we left off" file: a new session
reads the top entry first.

---

## 2026-10-07 — Two new Reports: Stock Report & Order Report
**Did:**
- Added **Stock Report** (`/reports`): every item's stock as of a chosen date (default
  today), columns Company/Item/Pack Size/HSN/Stock, no Totals row. Computed entirely in the
  frontend — summed `taxQty+dQty`/`qty` from every purchase-bill/sales-order line up to the
  cutoff date, per item — since dates are free-text and not SQL-comparable (no new DB
  query needed; reuses `ListItems`/`ListPurchaseBills`/`ListSalesOrders`). New
  `internal/reports/stock_report.go` (merged title row above the header, since there's no
  per-row date column; header frozen at row 2).
- Added **Order Report** (`/reports`): one row per sales-order line, columns
  Date/Customer/City/Item/Pack Size/GST %/HSN/Qty/Rate/Final Amount/Delivered?/Delivery #,
  filterable by a date range and a new tri-state delivery-status `Select` (All/Delivered
  only/Pending only) — added as a new shared `ui/select.tsx` primitive since the existing
  `SavedOrders.tsx` `Switch` is binary and can't express "All." Totals row sums only Qty +
  Final Amount, mirroring the on-screen order Totals convention. New
  `internal/reports/order_report.go`.
- Both new Go writers mirror `purchase_summary.go`'s excelize scaffold exactly (bold
  header, typed date/money/percent cells, frozen + auto-filtered header). Two new `app.go`
  methods (`ExportStockReport`, `ExportOrderReport`) follow the existing 5-step
  SaveFileDialog pattern. Bindings regenerated via `wails generate module`.
- `npx shadcn@latest add select` generated a file importing `cn` from a stray `cn` npm
  package instead of the project's `@/lib/utils` — fixed the import and removed the
  accidental `"cn": "^0.4.0"` dependency it added to `package.json`.
- Verified end-to-end in `wails dev` against the real DB: Go `go build`/`go vet` clean,
  frontend `npm run build` clean, date picker and delivery-status `Select` both work in the
  browser, delivered/pending counts sum correctly to "All" (1 + 13 = 14 lines, 1 + 4 = 5
  orders). Downloaded both reports and inspected the raw `.xlsx` XML: merged title row,
  header row/freeze pane/autofilter ranges, number formats, and Totals-row math all matched
  spec exactly. Test export files deleted afterward (not real reports).

**Next steps:** none outstanding from this session. Remaining open items are unchanged —
the second UI density tier (declined by the client, offer again later) and the 2026-09-28
demo-data cleanup.

---

## 2026-10-06 — UI density pass: strip redundant chrome across every page
**Did:**
- Acted on client feedback that the UI "uses too much space" and that labels like "Line
  items" over an obvious table are self-explanatory. **Measured first rather than guessing**:
  on a 1470x801 window the first data row started at 681px on Customers (3 rows visible) and
  489px on Items (6 rows), nearly all of it chrome.
- **Shared, one-line-each changes:** `ui/card.tsx` `py-6`/`gap-6`/`px-6` → `py-4`/`gap-4`/
  `px-4`; `App.tsx`'s `<main>` `py-8`→`py-4`; 12 `space-y-6` page roots → `space-y-4`; empty
  states `py-16`/`py-12` → `py-10`.
- **Removed:** 7 decorative `CardHeader`s (Add Order's "Order details" and "Line items", the
  two on Add Purchase Bill, and the "Add item"/"Add company"/"Add customer" headers), 4 page
  `<h1>` + subtitle blocks (View/Edit Orders, View/Edit Bills, Reports, Settings), 3 orphan
  count lines, and the 3 `CardTitle`s that were verbatim nav labels. Record counts moved into
  the toolbar beside the search box. Redundant field labels went `sr-only` (chosen over
  `aria-label` because the comboboxes don't forward arbitrary props).
- **Kept on purpose:** the edit-mode "Edit order"/"Edit purchase bill" headings (shrunk to
  `text-base`) — the nav says "Add …" in edit mode too, so they're the only sign you're
  changing an existing record — plus the detail-view, Reports-tile and Settings-section
  headers. Two behaviour facts buried in deleted descriptions were rescued inline next to the
  Add/Save button rather than lost.
- **Bug found and fixed in passing:** Items/Companies/Customers wrote their list-card header
  as `flex-row items-center justify-between space-y-0`, but `flex-row` doesn't set
  `display: flex` and `CardHeader`'s own `grid` won — so the title and search box had been
  *stacking* rather than sharing a row, costing 32px per page. Now real `flex`.
- **Result, re-measured in the app rather than assumed:** Items 489→289px (6→10 rows),
  Customers 681→481px (3→6), Companies 489→267px (9→10), View/Edit Orders 289→181px (4→12),
  View/Edit Bills 289→181px (→16). Roughly +67% content on screen.
- Verified with a visual walk of all 10 routes, both detail views and the delivered-order
  edit lockdown; Dashboard stays exactly centered, unsaved-changes guard still fires.
  `npm run build` ✅.

**Next steps:** the client declined the second tier (shrinking rows 49→37, inputs 36→32,
base font 14→13px), which is what would take Items past ~10 rows to ~13 — offer it again
once they've lived with this. The 2026-09-28 cleanup item (deleting the seeded demonstration
order and test masters from the real DB) is still open.

---

## 2026-10-06 — Delivered orders: irreversible, numbered, edit-locked
**Did:**
- **Reworked delivery from a reversible boolean into a one-way, numbered state** — the
  client changed their mind on reversibility (superseding the 2026-09-27 decision). New
  `sales_orders.delivery_number` column (migration id 10) is now the source of truth, with
  migration id 11 backfilling already-delivered rows 1..N in id order. Chose a **column
  over the `delivered_orders` table the client floated**: moving rows would be a
  data-relocating migration against real client data, wouldn't fit the runner's
  one-statement-per-id shape, and would force a `UNION` into every derived read (item
  stock, the customer delete-guard). The old `delivered` boolean is kept and written in the
  same statement — never read by Go — purely so an updater rollback to a v0.7 build still
  shows correct status.
- **Numbering is `MAX + 1`**, allocated inside the mark statement itself
  (`WHERE id = ? AND delivery_number = 0`, so irreversibility is enforced in SQL and a
  double-mark errors). Gaps are permanent; the one accepted wrinkle — deleting the
  *highest*-numbered order frees its number for reuse — is documented and pinned by a test.
  Deleting a delivered order stays allowed, per the client.
- **A delivered order is frozen apart from Qty and Rate**, enforced in Go rather than only
  in the UI: `UpdateSalesOrder` now reads `delivery_number` as the first statement in its
  transaction and refuses a delivered order outright (so its whole-row overwrite and
  `DELETE FROM sales_order_items` can't reach one), and the new `UpdateDeliveredSalesOrder`
  validates customer/date/line-count/item/pack-size against the stored rows before issuing
  targeted per-line `UPDATE ... SET rate, qty`. Lines match positionally against ids read
  inside the function, so `SalesOrderItem` gained no `ID` field and the frontend is never
  trusted to round-trip row ids.
- **Frontend**: the `/orders` "Delivered only" toggle became **exclusive** (on = delivered
  only, off = undelivered only), the now-redundant Status column was dropped, and the
  delivered view gained a sortable **Delivery #** column while the pending view keeps the
  mark-delivered button. **Marking is confirmed** by a new shared `MarkDeliveredDialog` —
  the client's ask, matching the existing delete confirm — used from both the list row and
  the edit page. Detail/edit headers show a `Delivered #N` badge; the edit page disables
  Customer, Date, item picker and Pack Size and hides Add-row/delete-row. `CustomerCombobox`
  gained a `disabled` prop. Exports (WhatsApp image / Excel / PDF) are deliberately
  untouched — the number is in-app only.
- **First sales-order tests in the codebase** (`internal/db/sales_orders_test.go`, 11 of
  them) covering numbering, one-wayness, the `UpdateSalesOrder` refusal, the allowed
  qty/rate edit (asserting the line row ids survive, i.e. a targeted update), every
  rejection case, the delete-gap/number-reuse behaviour, and migration 11's statement run
  verbatim against pre-migration-shaped rows.
- Verified end-to-end: `go build/vet/test` ✅, `npm run build` ✅, and the whole flow walked
  in `wails dev` + the Chrome extension against a **copy of the real dev DB** — the
  pre-existing delivered order backfilled to #1, two more marked to #2/#3 (confirm dialog
  opening and Cancel writing nothing both checked), the lockdown verified on screen, a
  delivered order's Qty/Rate edit confirmed to leave `sales_order_items.id` untouched, and
  Copy Order Image re-rendered correctly with no delivery number. **The dev DB was restored
  to its pre-test state afterwards** (backup taken before the run), so those test marks
  aren't sitting in it — the migration simply re-applies on next open.

**Next steps:** none outstanding for this batch. The still-open cleanup item from
2026-09-28 (deleting the seeded demonstration order #5 and the earlier test
company/items/customer from the real DB) remains open.

---

## 2026-09-30 — Order pages polish: column order, image preview dialog, export styling, auto-scroll, cursor styling
**Did:**
- **Qty column moved to second position** (right after Item) in both Add/Edit Order
  (`AddOrder.tsx`) and the read-only Order detail table (`OrderDetail` in
  `SavedOrders.tsx`) — client wanted it more prominent. Totals-row column spans adjusted
  accordingly.
- **Copy Order Image now opens a preview dialog** instead of copying straight to the
  clipboard — a new shadcn `Dialog` shows the rendered image with Copy/Cancel buttons,
  so the client can see exactly what will be shared before it's copied. Side effect: the
  old Safari/WebKit clipboard-timing hack (handing `ClipboardItem` a still-pending
  render promise to dodge lost "user activation" across an `await`) is gone — the
  dialog's own Copy click is a fresh user gesture, so the write can just use an
  already-resolved `Blob` directly. Swapped `html-to-image`'s `toPng`+dataURL-slicing
  for `toBlob` throughout, including the Save-dialog fallback path.
- **Visual cleanup applied identically to the shareable image, Excel export, and PDF
  export** (all three already mirrored each other's layout, so all three needed the
  same four tweaks): merged customer/date header into one seamless bar (no dividing
  line, header text a step larger than body text — 11→13 in the image, similarly
  11→13pt in Excel via an explicit font size, 10→12pt in the PDF); the gross-totals row
  merges its Item/Unit/Rate cells behind a right-aligned "Total" (Qty and Amount stay
  their own cells); deduction lines drop the word "unit" ("Less: 6 — Item" instead of
  "Less: 6 unit — Item") and are now right-aligned; the final net-total row merges all
  four of Qty/Item/Unit/Rate (its Qty cell was already blank, unlike the gross row).
  Excel achieves the "no dividing line" header via a border-sides helper (Excel can't
  merge two independently left/right-aligned text runs into one cell); PDF gained a
  `drawOrderHeaderBar` helper and a `mergeQty` flag on the shared totals-row drawer.
  Verified by generating real `.xlsx`/`.pdf` files directly from the Go export code
  (bypassing the browser) and inspecting the rendered output/underlying XML.
- **Auto-scroll to the newest row** on "Add row" in both Add Order and Add Purchase
  Bill — a ref on the last `<tr>` plus a `useEffect` keyed on `lines.length` calls
  `scrollIntoView({behavior: 'smooth', block: 'center'})`. Verified in the browser by
  adding many rows in a row.
- **`cursor-pointer` added to the shadcn `Button` base class** — every button (Logout
  included) now shows a pointer cursor on hover, matching the nav's `<a>` links which
  got it for free from the browser. One-line fix in `button.tsx`, app-wide.
- All five verified end-to-end: build/vet/tests pass, and every change was exercised
  live in the app via `wails dev` + the Chrome extension (column order, the new preview
  dialog including a real clipboard copy, auto-scroll, and the export layout changes on
  a real order with a custom-pack-size deduction).

**Next steps:** none outstanding for this batch. The still-open cleanup item from
2026-09-28 (deleting the seeded demonstration order #5 and the earlier test
company/items/customer from the real DB) remains open.

---

## 2026-09-28 — Custom pack size per order line
**Did:**
- Worked through the client's request (a specific carton sometimes physically packed
  differently than an item's standard pack size — voice-dictated, with a reference
  image) against multiple possible data models before writing any code — landed on: add
  the item as a **second order line** for the odd carton(s), Pack Size is now an
  editable field (was read-only), and on-screen everything stays formula-driven with
  zero new branching (`calcOrderLine` unchanged — just fed the effective pack size).
  Confirmed the model against the client's own worked example (20 standard, 10 cartons,
  1 actually 18) before building.
- Backend: `sales_order_items.custom_pack_size` (migration id 9, `0` = no override).
- Add/Edit Order: Pack Size is now an editable `NumberInput` (defaults to the item's
  master value on selection), with a small "Custom" badge when edited away from master.
  Same badge + effective-value display added to Order detail's on-screen table.
- Export-only re-grouping (Copy Order Image / Download Excel / Download PDF): new
  `buildOrderExportGroups` (`lib/salesOrder.ts`) combines same-item-and-rate lines into
  one row at the standard pack size (gross Total), then a `"Less: N unit — Item Name"`
  line per custom-pack-size line (or `"Add: ..."` for a larger-than-standard override),
  then a final net Total — reproducing the client's reference image layout exactly
  (verified: generated real Excel/PDF output with a deduction case and confirmed the
  numbers and layout match, including the no-deductions case staying unchanged).
- Seeded a demonstration order (id 5: 8 cartons of Rabdi Jar at standard pack size 36 +
  1 carton at custom pack size 30) into the real DB, reusing the customer/items already
  seeded for the Copy Order Image feature, so the client can check the "Less: 6 unit —
  Rabdi Jar 1/-" deduction end-to-end without manual data entry.
- `go build/vet/test` ✅, `npm run build` ✅. Docs updated (DATA_MODEL, FEATURES,
  DECISIONS).

Client reviewed live in `wails dev` and confirmed it looks good. Marked Shipped in
FEATURES.md.

**Next steps:** the seeded demonstration order (id 5) and the earlier test
company/items/customer (from the Copy Order Image session) are still in the real DB and
need manual cleanup via the app's own Delete buttons whenever convenient.

---

## 2026-09-28 — Download Excel / Download PDF for orders
**Did:**
- Two new buttons beside "Copy Order Image" (order detail view): Download Excel and
  Download PDF, same customer-facing content/style (client wanted visual consistency
  across all three: Qty/Item/Unit/Rate/Amount, yellow header/footer, black-bordered
  grid), as real files instead of a clipboard image.
- Backend: new `internal/reports/order_export.go` — `WriteOrderExcel` (`excelize`,
  matches the image's style) and `WriteOrderPDF` (new dependency
  `github.com/signintech/gopdf` — chosen over the now-Codeberg-hosted `go-pdf/fpdf`;
  hand-drawn cells, since gopdf's convenience table API can't do the merged header row
  this layout needs). `App.ExportOrderExcel`/`ExportOrderPDF` mirror
  `ExportPurchaseSummary`'s native-Save-dialog pattern.
- Bundled Nunito Regular+Bold TTFs (SIL OFL) into `internal/reports/fonts/`, embedded via
  `go:embed` — gopdf has no built-in fonts. A Plan-agent pass actually built and rendered
  a working proof-of-concept against the real library before writing the final code,
  which caught a real bug: gopdf shares its color operator between cell-fill and
  text-glyph color, so without an explicit `SetTextColor(0,0,0)` called once up front,
  header text renders invisible (yellow-on-yellow). Fixed and verified visually.
- Verified the embedded font renders accented Latin correctly using the seeded test item
  "Éclair 1/- PB" (rasterized the generated PDF and visually confirmed the "É" glyph).
  Also added small cell padding (text was touching borders) after the first render.
- Extracted `customerShareLabel` (the "{nickname||name} - {city}" logic) from
  `ShareableOrderImage.tsx` into `lib/salesOrder.ts` so all three exports (image, Excel,
  PDF) compute it identically. Generalized `OrderDetail`'s state
  (`sharing`/`shareNotice`/`shareError` → `busy: 'image'|'excel'|'pdf'|null` +
  `notice`/`error`) so only one export runs at a time.
- **Known cosmetic gap**: Excel's `#,##0.00` format only does Western 3-digit grouping
  (no Indian-grouping option in Excel's format codes), so its totals show "124,555.00"
  while the PDF/image show "1,24,555.00" — matches the existing Purchase Summary Excel
  export's same limitation, not new, not fixed.
- `go build/vet/test` ✅, `npm run build` ✅. Docs updated (DATA_MODEL, FEATURES,
  DECISIONS).

**Next steps:** client verification in `wails dev` (Excel + PDF visual check against the
existing WhatsApp image, cancel-dialog behavior, an order with many line items to check
PDF pagination) before marking Shipped in FEATURES.md.

---

## 2026-09-28 — Copy Order Image: more compact sizing
**Did:** client asked for smaller image / more line items fitting on screen. Shrank
`ShareableOrderImage.tsx`: font 14px → 11px, cell padding `6px 10px` → `2px 6px` (plus a
`lineHeight: 1.3` to keep it readable at the smaller size). `go build/vet`, `npm run
build` ✅. Docs updated (FEATURES).

**Next steps:** none for this tweak — same outstanding items as below (seeded test data
cleanup, Windows clipboard verification).

---

## 2026-09-28 — Copy Order Image (WhatsApp sharing)
**Did:**
- Explored options for sharing an order to WhatsApp before building anything: WhatsApp
  can't auto-attach a file via any link (wa.me or otherwise), and the Business Cloud API
  that *can* send files needs Meta verification, a live server, and per-message cost —
  wrong fit for this local/no-server app. Client settled on the simplest workable shape:
  one button, renders the order as an image, copies it to the clipboard, user pastes into
  WhatsApp themselves. No wa.me link, no message text, no auto-opening WhatsApp.
- New "Copy Order Image" button on the order detail view (`/orders`). New component
  `ShareableOrderImage.tsx` renders a purpose-built customer-facing layout (yellow
  header/footer, black-bordered grid, `{nickname or name} - {city}` + date header,
  Qty/Item/Unit/Rate/Amount columns, bold total row) matching a reference image the
  client provided — no GST%/HSN, and no packaging-type ("Pack": PB/Jar/Cont/Box) column
  since that's not data the Item master tracks.
- Backend: `CustomerNickName`/`CustomerCity` added to `db.SalesOrder` (JOIN-populated,
  same shape as the existing `CustomerName`) for the header line; new
  `App.SaveOrderShareImage` (fallback-only — native Save dialog, same pattern as
  `ExportPurchaseSummary`). No migration.
- **Bug found during first live test**: clicking the button always fell into the
  Save-dialog fallback instead of copying to clipboard. Root cause: the code awaited the
  image render (`toPng`) *before* calling `navigator.clipboard.write()` — Safari/WebKit
  (the macOS dev build's WKWebView) revokes the click's clipboard permission the moment
  any `await` happens first. Fixed by calling `clipboard.write()` as the very first async
  step, handed a still-pending render promise via `ClipboardItem` instead of an
  already-awaited one, so the write call itself stays synchronous with the click.
- Seeded a throwaway test company/8 items/customer ("Amber Traders" / nick "Amber Ji" /
  Meerut, matching the client's reference)/order directly into the real DB
  (`/Users/harshit/Downloads/inventory.db`, client's explicit choice over a scratch DB)
  via a one-off `cmd/seedtest` script (deleted after running) so the client could visually
  compare the rendered image against their reference. **Client confirmed it looks good —
  this test data (company "TEST - Sample Co (delete me)" id 10, items id 95-102,
  customer id 4, order id 4) is still in the real DB and needs manual cleanup via the
  app's own Delete buttons.**
- `go build/vet/test` ✅, `npm run build` ✅. Docs updated (DATA_MODEL, FEATURES — moved to
  Shipped, DECISIONS).

**Next steps:** delete the seeded test data (company/items/customer/order listed above)
from the real DB via the app's Delete buttons. Clipboard-write behavior is unverified on
the shipping Windows/WebView2 target — worth a specific check next time a Windows build
is tested; the Save-dialog fallback covers it either way if clipboard write is blocked
there. No release tagged this session.

---

## 2026-09-27 — Order delivered status + a stale-form nav bug fix
**Did:**
- **Order delivered status**: new `sales_orders.delivered` column (migration id 8,
  defaults not-delivered). Reversible toggle from two places — an inline row button on
  `/orders` (`SavedOrders.tsx`) and a "Mark delivered"/"Mark not delivered" button on the
  order edit page (`AddOrder.tsx`) — both call a new `SetSalesOrderDelivered` directly,
  bypassing the edit form's Save/dirty-tracking flow. `/orders` defaults to undelivered
  orders only, with a "Show delivered" `Switch` to include the rest; visible rows (and the
  detail view) get a Delivered/Pending `Badge`. `UpdateSalesOrder` deliberately excludes
  `delivered` from its SET clause so a content-only edit/save can never reset it. Added
  shadcn `Switch`/`Badge` (first use of either in this codebase; also first boolean
  column) — had to fix the CLI-generated `cn` import (`"cn"` package) back to this
  project's `@/lib/utils` convention, and dropped the resulting unneeded `cn` npm dep.
- **Bug found while testing the above, fixed in both `AddOrder.tsx` and
  `AddPurchaseBill.tsx`**: leaving an edit form via top-nav (e.g. clicking "Add Order"
  mid-edit, confirming "Discard changes") landed on the "new" form still showing the
  edited record's data. Root cause: `/x/new` and `/x/:id/edit` render the same component
  instance (React Router doesn't remount across same-position route matches), and the
  edit-prefill effect only ever wrote form state `if (editId != null)` — nothing reset it
  back to blank on the reverse transition. Fixed with a second effect that clears the form
  whenever `editId` is null. See DECISIONS for the full writeup and the rejected
  alternative (keying the `<Route>` to force a remount).
- Verified live in `wails dev` (client walked through both the delivered-status flow and
  the nav bug repro). `go build/vet/test` ✅, `npm run build` ✅. Docs updated (DATA_MODEL,
  FEATURES — moved to Shipped, DECISIONS — two entries).

**Next steps:** commit, then decide whether this ships alone as a patch/minor version or
waits to bundle with more work — no release cut yet this session.

---

## 2026-09-27 — Post-v0.6.0 patch: five client-reported fixes
**Did:** (client tested v0.6.0 live; these came out of that session)
- **Add Order item search showed a phantom duplicate row** after the client renamed a
  Prayagh item to match Sapna's naming, making two different items share the same
  name+pack-size. Root cause: `ItemCombobox` keyed its dropdown rows by `label(it)`
  (name+packSize) instead of `it.id`, so React mis-reconciled once two rows collided on
  key. Verified via the real DB (`/Users/harshit/Downloads/inventory.db`, queried
  directly) that the master itself had no duplicate rows — 3 genuinely distinct items —
  confirming it was a pure frontend rendering bug, not a data problem. Fixed by keying on
  `it.id`.
- **Purchase Summary Excel export formatting:** quantity columns (Pack Size, Tax Qty,
  D Qty, and their Totals-row cells) now format `0` (no decimals) instead of `0.00` —
  matches the app's own whole-number convention for quantities. **GST % is now a real
  Excel Percentage cell** — value written as `gstPercent/100` with format `0%`, not the
  raw number as `0.00`. Verified by generating a workbook and inspecting `styles.xml` +
  the sheet XML directly (confirmed the `0`/`0%` numFmts and the `0.05`-style cell value).
- **Add Order's item search widened** (`w-56` → `w-72`, via a new `className` override on
  `ItemCombobox`) and its dropdown row now goes two-line when showing company: name + pack
  size on line 1 (name truncates only if it still doesn't fit), company name on line 2 —
  first tried truncating everything onto one line, but that hid names too eagerly.
- **Customer State field silently dropped anything typed without picking a dropdown
  suggestion.** `StateCombobox`'s `onChange` only updated its own local text, never called
  `onSelect` — so the parent's `state` (and therefore `AddCustomer`/`UpdateCustomer`) never
  heard about free-typed text. Fixed by calling `onSelect` on every keystroke too; safe
  since State is a plain string column, not an FK like Company/Item.
- **Top-nav wrap on narrow windows (client's actual laptop) looked cramped** — the last
  two links wrapped to a second row, but the header had a *fixed* `h-14` while its `nav`
  wraps via `flex flex-wrap`, so the wrapped row overflowed past the header's own box with
  no breathing room before the border. Changed to `min-h-14 flex-wrap` + `py-2` so the
  header grows to fit however many rows wrap, evenly padded top and bottom.
- `go build/vet/test` ✅, `npm run build` ✅. Docs updated (DECISIONS, FEATURES).

Committed (`9279c16`) and tagged **v0.6.1**; CI publishes the Windows `.exe` release.

**Next steps:** none outstanding for this patch. Pick up the next item from FEATURES.md
Planned (Dashboard content, more Reports cards, auto-check-for-updates, or Order number).

---

## 2026-09-27 — View/Edit Orders (third, and last-planned, piece of the Order Book)
**Did:**
- New `/orders` page (`SavedOrders.tsx`, top-nav "View/Edit Orders" right after Add
  Order): a near-verbatim structural copy of `SavedBills.tsx` — list (Customer · Date ·
  Qty · Final Amount, sortable, search by customer, date-range filter) → read-only detail
  → Edit/Delete. No order-number column (doesn't exist); detail view has no Stock column
  (that's for planning a new order, not a fact about a saved one).
- **`AddOrder.tsx` gained edit mode** (`/orders/:id/edit`), the same dual-purpose pattern
  `AddPurchaseBill.tsx` already uses: `GetSalesOrder` prefills header + lines, Save becomes
  "Update order" (`UpdateSalesOrder`, full overwrite), returns to `/orders` on success.
  Caught a real footgun before it shipped: `AddPurchaseBill`'s partial-object trick for
  prefilling Company (`{id, name} as db.Company`) would **not** be safe for Customer, since
  `CustomerCombobox` dereferences `.nickName`/`.city` directly — a partial cast would throw
  at runtime the first time the combobox rendered. Fixed by resolving the customer from a
  freshly-fetched full `ListCustomers()` instead. Each line's rate history is fetched on
  load (info button works immediately) but its Rate is left exactly as saved, not
  re-prefilled with today's latest.
- **Backend:** `ListSalesOrders`/`GetSalesOrder`/`UpdateSalesOrder`/`DeleteSalesOrder`
  added to `internal/db/sales_orders.go` + `app.go`, each a direct structural mirror of
  the matching `purchase_bills.go` function (same transactional delete-and-reinsert for
  Update, same two-query header-then-lines shape for List/Get). No schema change.
- Confirmed Stock and rate history need **zero extra code** to stay correct after an edit
  or delete — both are derived live from `sales_order_items`, so any change is picked up
  automatically everywhere else that reads them.
- `go build/vet/test` ✅, `npm run build` ✅. Docs updated (DATA_MODEL, UI, FEATURES,
  DECISIONS).

Client reviewed live in `wails dev` and confirmed it all looks good. Marked Shipped in
FEATURES.md (**v0.6.0**, bundling the whole Sales/Order-Book epic — Customers, Add Order,
item stock, View/Edit Orders — plus the already-committed `dd-mmm-yy` date-format fix and
migration-policy doc clarification). Committed, pushed to `main`, tagged **v0.6.0**.

---

## 2026-09-26 — Add Order refinements: customer-first entry, switch prompt, item stock
**Did:** (client feedback from manually testing Add Order, two rounds, same day it shipped)
- **Item entry now locked until a customer is chosen** ("Select a customer first"
  placeholder) — rate-history prefill needs a customer to look up against.
- **Changing the header customer after lines already have items** now prompts instead of
  applying silently: Cancel / **Keep current rates** / **Recalculate rates** (re-runs the
  rate-history lookup for every filled line and re-prefills Rate). Same for quick-adding a
  brand-new customer mid-order. Cancel reverts the picker via the same combobox-remount
  trick `AddPurchaseBill.tsx` already uses for its company switch.
- **New Stock column** — current on-hand quantity (total purchased minus total sold),
  shown on both Add Order's line-items table and the Items master table. **Derived**, not
  stored: one correlated-subquery addition to the existing `itemSelect` query
  (`internal/db/items.go`), so every existing `ListItems`/`ListItemsByCompany` caller gets
  `Item.Stock` for free — no new table, no new Go method, no extra round trip when a line's
  item is picked on Add Order. Verified the SQL directly against the real sample DB before
  wiring it up. No over-sell validation — Qty > Stock is allowed, shown for reference only.
  Add Order re-fetches its item cache after a successful save so Stock stays current for
  the rest of the session.
- `go build/vet/test` ✅, `npm run build` ✅. No schema/migration change (stock is a query
  expression, not a column). Docs updated (DATA_MODEL, UI, FEATURES, DECISIONS).

**Next steps:** verify live in `wails dev` — item picker disabled until a customer is
picked; switching customer with items already added shows the prompt and each option
behaves as described; Stock displays correctly on both pages and updates after saving an
order for the same item. Then ask before committing (nothing from this Add Order /
Customers-master work is pushed yet).

---

## 2026-09-26 — Add Order page (second piece of the Sales / Order Book feature)
**Did:**
- New `/orders/new` page (top-nav "Add Order", after View/Edit Bills): Customer header
  (`CustomerCombobox` — filters by name/nickname/city) + Date, then line items with a
  **global** item search (not scoped to anything, unlike Add Purchase Bill's
  per-company one) showing Pack Size/GST %/HSN read-only, user-entered Rate/Qty, and a
  calculated Final Amount (`Rate × Qty × Pack Size`). Totals row sums Qty and Final
  Amount. Create-only for now — no order number, no edit mode; View/Edit Orders is later
  work, same incremental path Purchase Bills took.
- **Rate history**: selecting an item prefills Rate from the customer's latest past rate
  for it (blank if none), plus an info button showing the full date-descending history.
  Deliberately **derived from past orders** (`sales_order_items` JOINed to
  `sales_orders`), not a separate table — nothing to keep in sync. Frontend sorts by
  parsed date since the stored date is free text.
- **Backend:** new `sales_orders`/`sales_order_items` tables (migrations 6, 7) and
  `internal/db/sales_orders.go` (`AddSalesOrder`, `RateHistory`) — Add-only scope for now,
  full schema already in place for when View/Edit Orders needs List/Get/Update/Delete.
- **Reused and extended two existing components** rather than building parallel new ones,
  per client instruction: `ItemCombobox` gained an opt-in `showCompany` flag (Add Purchase
  Bill's look is unchanged, flag defaults off) so the same component disambiguates
  same-named items across companies now that search is global; `EditCustomerDialog`
  gained a create mode (`customer={null}`) so Add Order's quick-add-customer flow uses the
  exact same full 9-field form as the Customers page, not a stripped-down dialog
  (`onUpdated` renamed `onSaved` since it now covers both add and update).
- **Caught and fixed a real bug while updating docs**: `sales_orders.customer_id` is the
  first FK into `customers`, so the already-shipped `DeleteCustomer` (previously
  unguarded, since nothing referenced customers yet) would have hit a raw SQLite
  foreign-key error the first time someone deleted a customer with orders. Added the same
  `COUNT(1)` reference guard `DeleteCompany`/`DeleteItem` already have, before this shipped.
- Also fixed a **pre-existing, unrelated doc inaccuracy** noticed while writing this
  session's UI.md entry: Add Purchase Bill's item search was documented as "cached via
  `ListItems`" but has actually always been company-scoped (`ListItemsByCompany`) —
  corrected in `docs/UI.md`.
- `go build/vet/test` ✅, `npm run build` ✅. New tables are additive — no DB reset needed.
  Docs updated (DATA_MODEL, FEATURES, UI, DECISIONS).

**Next steps:** verify live in `wails dev` — customer search by name/nickname/city, date
defaults to today and is editable, item search is global and shows company for
disambiguation, Rate/Qty/Final Amount and the Totals row compute correctly, Save
disabled-until-valid and resets the form on success, quick-add for both customer (full
form, Name+City required) and item works and selects the new record into the line/header.
Then specifically exercise **rate history**: an item with no prior orders leaves Rate
blank; after saving one order, starting a second order for the same customer+item
prefills Rate from it and the info button shows that entry; a third order at a different
rate shows both, newest first. Then ask before committing.

---

## 2026-09-26 — Docs: clarified migration policy (additive vs. breaking)
**Did:** Client asked how the new `customers` table would reach their existing database
without losing data — answered (auto-applied on next launch, zero-touch to existing
tables), then wrote the distinction down since the old "delete the dev DB to reset it"
guidance predates any real client data existing:
- `docs/DATA_MODEL.md` and `CLAUDE.md`: additive changes (new table/defaulted column) are
  auto-safe against *any* database including the client's production one — no manual step,
  no data loss. "Wipe the DB" is now explicitly scoped as local-dev-only. A breaking change
  (rename/retype/drop a column) needs a real hand-written migration, not a slice append.
- `docs/DECISIONS.md`: dated entry recording the same, with why.
- No code changes — `internal/db/migrate.go`'s behavior was already correct; this closes a
  documentation gap before it could cause a future session to suggest wiping real data.

---

## 2026-09-26 — Customers master (first piece of the Sales feature)
**Did:**
- New `/customers` page (own top-nav link, after Companies): add/edit/delete customers
  with 9 fields — Name, Nick Name, Address 1, Address 2, City, State, Pincode, GSTIN,
  Mobile. Only **Name and City are required**.
- List table shows every field with **Address 1/2 merged into one Address column**;
  search matches name/nickname/city/mobile/GSTIN; every column except Address is
  sortable — same Companies/Items pattern throughout (`EditCustomerDialog`, controlled
  Delete confirm, unsaved-changes guard on the add form).
- **Backend:** new `customers` table (migration id 5, `internal/db/migrate.go`) and
  `internal/db/customers.go` (`AddCustomer`/`UpdateCustomer`/`DeleteCustomer`/
  `ListCustomers`) — passed as a whole `db.Customer` struct rather than flat params
  (9 fields). `DeleteCustomer` is **unguarded** for now — nothing references customers
  yet (no Sales bills exist); noted under Planned to add the same reference-count guard
  Company/Item have once they do.
- **Client feedback from manual testing, fixed before committing:**
  - **Mobile** now validated as an exact 10-digit number: `MobileInput`
    (`frontend/src/components/MobileInput.tsx`, mirrors `NumberInput`'s approach) blocks
    non-digit characters and caps length at 10; Add/Save stays disabled and an inline
    "Mobile number must be 10 digits." error shows if a partial number is entered
    (empty is still fine — mobile stays optional).
  - **State** switched from a dropdown to a type-to-filter combobox
    (`frontend/src/components/StateCombobox.tsx`), matching the
    Company/Item-combobox interaction already used on Add Purchase Bill, rather than a
    plain `Select`. This replaced the originally-added shadcn `Select` primitive
    entirely — removed `components/ui/select.tsx` since nothing uses it anymore.
  - Along the way, caught and fixed a rough edge from the shadcn CLI: `npx shadcn add
    select` had generated `select.tsx` importing `cn` from a generic `cn` npm package it
    auto-installed, instead of this project's own `@/lib/utils` (every other
    `components/ui/*` file uses the latter) — fixed before it was ever committed, and
    `npm uninstall`ed the stray dependency (moot now that the file itself is gone too).
- `go build/vet/test` ✅, `npm run build` ✅. New table is additive — no DB reset needed
  (existing data untouched, `customers` starts empty). Docs updated (DATA_MODEL, UI,
  FEATURES → In Progress, DECISIONS).

Client reviewed live in `wails dev` (including the mobile/state fixes) and said to
commit. Sales bills themselves are a separate, future piece of work — not started.

---

## 2026-09-26 — Date format: dd-mmm-yyyy → dd-mmm-yy (client feedback)
**Did:** (first piece of client feedback on the live app)
- `frontend/src/lib/date.ts`: `formatDate` now writes a 2-digit year; `parseDate` made
  **permanently** tolerant of both the new 2-digit and legacy 4-digit year (real DB
  already has 28+ bills stored as `dd-mmm-yyyy`, never rewritten — a strict cutover would
  have broken sorting, date-range filtering, and the Add/Edit Save button for every
  existing bill). Added a new `displayDate(raw)` helper that normalizes any stored string
  to the current form for display.
- Wired `displayDate` into every raw-date-display/pass-through site: `SavedBills.tsx`
  (list row + detail header), `AddPurchaseBill.tsx` (edit-prefill), `Reports.tsx`
  (Excel row-building, so Go always receives the current format).
- `internal/reports/purchase_summary.go`: Excel date column/format → `dd-mmm-yy`; Go's
  `time.Parse` layout simplified to the single current format (safe, since the frontend
  now always normalizes before handing Go a row).
- Verified the new parse/format/display logic standalone (round-trips a 2-digit year,
  still parses+normalizes an existing 4-digit-year string, rejects malformed input) before
  wiring it in; regenerated a sample `.xlsx` and confirmed the Excel date cell is still a
  real, sortable date under the new `dd-mmm-yy` format. `go build/vet/test` ✅,
  `npm run build` ✅. Docs updated (CLAUDE.md, UI.md, DATA_MODEL.md — also fixed an
  already-stale `dd/mm/yyyy` line there —, FEATURES.md, DECISIONS.md).

**Next steps:** verify live in `wails dev` against the real sample DB (28+ bills stored
with 4-digit years) — View/Edit Bills list + detail now show `dd-mmm-yy` for every
existing bill, sorted correctly; opening an old bill for edit has Save enabled
immediately; a newly typed/calendar-picked date writes `dd-mmm-yy`; Reports date-range
filter + Excel export still work correctly across old and new bills. Then ask before
committing/tagging a release.

---

## 2026-09-20 — In-app self-update ("Check for Updates" button)
**Did:**
- New **Updates** section on Settings: shows the running version, a **Check for Updates**
  button, and — when newer — release notes + a **Download & Install** button.
- **Version embedding:** `main.go` gained `var version = "dev"`; `build-windows.yml` now
  builds with `-ldflags "-X main.version=$tag"` and also emits a `.sha256` checksum file
  next to the `.exe`, both published as release assets.
- **Backend:** new `internal/updater` package — `Check` (portable: hits the GitHub
  Releases API, numeric `vMAJOR.MINOR.PATCH` comparison so `v0.10.0 > v0.9.0` compares
  correctly, tolerates a release with no checksum asset) and `Apply` (wraps
  `github.com/minio/selfupdate`, verifies the checksum when present, keeps the previous
  binary as `<exe>.old` for rollback). Three new `App` methods: `GetAppVersion`,
  `CheckForUpdate`, `DownloadAndInstallUpdate` — the last hard-guarded to
  `runtime.GOOS == "windows"` so a stray click during `wails dev` on macOS can't corrupt
  the dev binary.
- `go test ./...` — added table-driven tests for the version comparator + an
  `httptest`-mocked GitHub API check (both pass without network/Windows). Also verified
  `Check` live against the real `thegamer1907/gopal-v2` repo via a throwaway script:
  correctly found v0.4.0, resolved the right download URL, and (correctly) reported no
  checksum since v0.4.0 predates this feature. `go build/vet/test` ✅ on macOS, plus a
  `GOOS=windows GOARCH=amd64` cross-compile check ✅. `npm run build` ✅.
- Docs updated (FEATURES → In Progress, UI.md Updates section, DECISIONS entry).

**Not yet verified:** the actual file-replace + relaunch (`DownloadAndInstallUpdate`)
can't be exercised on this Mac — it's guarded to Windows by design, and even ungated, a
downloaded Windows `.exe` can't run here. Needs a real test on Windows after this ships:
install the current build, cut one more tag, then Check for Updates → Download & Install
and confirm it replaces itself in place and relaunches cleanly.

Client reviewed the check-only flow live in `wails dev` and said to ship it — committed,
pushed to `main`, tagged **v0.5.0**, marked Shipped in FEATURES.md. **Next step is the
client's own real-Windows test**, exactly as described above: once v0.5.0 is installed,
cut one more small release and use the in-app button to update to it, confirming the
replace-and-relaunch actually works before relying on it for real.

---

## 2026-09-20 — Reports page + Purchase Summary Excel export (new feature)
**Did:**
- New **Reports** area: `/reports` route + top-nav link, `src/pages/Reports.tsx`. A card-grid
  layout (one `Card` per report type) so future reports are just more cards. First (only) card:
  **Purchase Summary**.
- **Purchase Summary**: reuses `DateRangeFilter` (empty = all bills, same as View/Edit Bills —
  no separate toggle), shows a live "N lines across M bills · ₹total" preview, and a Download
  Excel button. Flattens filtered bills into one row per line, computing GST/totals via the
  existing shared `calcLine` (never re-derived in Go), sorted chronologically.
- **Backend:** added **`github.com/xuri/excelize/v2`** (first Excel dep, pure Go/no CGO). New
  `internal/reports` package (`PurchaseSummaryRow` + `WritePurchaseSummary`) writes a workbook
  with **real typed cells**: Date as a genuine Excel date (`dd-mmm-yyyy` custom format,
  sortable); money columns `#,##0.00`; quantity/rate-support columns `0.00`; HSN plain integer.
  Bold frozen+auto-filtered header, bold Totals row. New `App.ExportPurchaseSummary` opens a
  native Save dialog (mirrors `CreateNewDatabase`'s pattern) and calls it. Also joined
  `items.hsn` into `PurchaseBillItem` (`ListPurchaseBills`/`GetPurchaseBill`) since the report
  needed it — column already existed, no migration.
- **Caught during implementation:** an ordering bug where applying whole-column number-format
  styles *after* the header/totals bold styles silently stripped the bold from those cells
  (`SetColStyle` overrides existing per-cell styles). Fixed by applying column styles first,
  then bold on top; totals row uses combined bold+numFmt styles per column instead of a blanket
  bold, so the accounting format survives on the totals line too. Verified by generating a
  sample workbook and inspecting the raw XML (cell types, numFmt ids, date serial values).
- `go build/vet/test` ✅. `npm run build` (tsc + vite) ✅. Docs updated (FEATURES → In Progress,
  UI.md new Reports screen section + nav list, DECISIONS entry).

**Decisions:** see `docs/DECISIONS.md` 2026-09-20 — card-grid layout for extensibility;
frontend-computes/Go-writes split (single-sourced formulas); explicit real typed date/number
cells with the accounting-style formats the client asked for, chosen via AskUserQuestion.

**Client verified live in `wails dev`** and approved — marked Shipped in FEATURES.md
(**v0.4.0**), committed, pushed to `main`, and tagged `v0.4.0` to cut the Windows release.
No DB reset needed (additive read-side change only).

---

## 2026-06-15 — Navigation moved from left sidebar to a flat top bar
**Did:** (client feedback — uncomfortable with the sidebar, keeps forgetting it's collapsible,
prefers top nav + natural vertical scroll)
- New **`TopNav.tsx`**: flat, always-visible horizontal bar — wordmark + all 5 page links in one
  row, Settings + Logout on the right. Active route highlighted (exact-match). Carried the
  unsaved-changes guard (intercept + reworded dialog) and the quit confirm over from the sidebar.
- **`App.tsx`** shell reworked to `div.flex.h-svh.flex-col` › `TopNav` › `<main flex-1 overflow-auto>`.
- **Deleted** `AppSidebar.tsx` and the now-unused `ui/sidebar.tsx` primitive (nothing else imports
  it). Bundle shrank (CSS 60→48 kB, JS 437→418 kB).
- Verified `npm run build` (tsc + vite) ✅. Docs updated (UI app-shell section; DECISIONS entry
  superseding the 2026-06-09 sidebar decision).

**Next steps:** verify live in `wails dev` — all links navigate + active highlight, Dashboard still
centers, wide Add-Bill grid uses full width, unsaved-guard fires on a nav click, Logout confirm →
quit. Then ask before marking Shipped / cutting a release. Frontend-only, **no DB reset**.

---

## 2026-06-15 — Sortable/filterable tables, bills list rework, Indian number format
**Did:** (client feedback batch)
- **Indian number format:** split `fmt` in `lib/purchaseBill.ts` into `fmt` (money, `en-IN`,
  2-dec) + `fmtQty` (qty, whole). Money sites unchanged (name kept); switched qty totals/cells in
  SavedBills + AddPurchaseBill to `fmtQty`. Amounts now show `1,20,300.00`.
- **Shared table helpers (lightweight, no library):** `hooks/useTableSort.ts`,
  `components/SortableHeader.tsx`, `components/DateRangeFilter.tsx` (Popover + range Calendar).
- **View/Edit Bills list reworked:** columns now **Company · Date · Bill number · Qty · Amount**
  (Qty = Σ taxQty+dQty), migrated to shadcn `Table`, **default sort date-desc**, sortable headers,
  a **search box** (company/bill no.) and a **date-range filter** (end-of-day upper bound).
- **Items + Companies:** sortable headers; added a search box to Companies (Items already had one).
- Verified `npm run build` (tsc + vite) ✅. Docs updated (FEATURES, DECISIONS, UI).

**Next steps:** verify live in `wails dev` — bills column order/default sort/header sorting,
search + date-range filtering, and Indian commas (esp. a value > ₹1,00,000 and whole-number qty).
Then ask before marking In-Progress → Shipped and cutting a release. **No DB reset** (frontend-only).

---

## 2026-06-15 — Masters edit/delete (Items + Companies) + items search
**Did:** (Planned items #1 and #2)
- **Backend:** `UpdateItem`/`DeleteItem` and `UpdateCompany`/`DeleteCompany` in
  `internal/db` + exposed on `app.go`; bindings regenerated. **Delete is reference-guarded**
  (explicit COUNT, friendly error): a company is blocked while items/bills use it; an item is
  blocked while bill lines use it. Added `TestMastersEditAndDelete`. `go build/vet/test` ✅.
- **Frontend:** new controlled dialogs `EditItemDialog` (reuses the add fields; can move the
  item to another company) and `EditCompanyDialog` (rename). Items + Companies tables gained an
  **Actions** column (Edit pencil / Delete trash) wired to those dialogs and a controlled
  delete `AlertDialog`. **Items search box** filters by item **or** company name. `npm run build` ✅.
- **Scope correction:** dropped the GSTIN/address columns I'd started on — client wanted
  **edit/delete only, no schema change**. Those columns are **not** planned (removed from the
  backlog); don't re-add unless the client asks.
- Docs updated (FEATURES → In Progress, DECISIONS).

**Next steps:** verify live in `wails dev` (edit item incl. company move, delete blocked-vs-
allowed for both masters, search). Then ask before marking In-Progress → Shipped and cutting a
release. **No DB reset needed** (no schema change this round).

---

## 2026-06-10 — Client-verified; cut release v0.2.1
**Did:** Client reviewed and **verified** everything built since v0.2.0 — batch-1 quick wins
(dd-mmm-yyyy dates, Final Rate fix, fuller totals, darker inputs, maximised + Logout, centered
Save), **items-belong-to-a-company** (company FK + company-first bill flow), and **View/Edit
Bills** (edit = full overwrite + delete). Moved those features **Shipped** in `FEATURES.md`.
Committed, pushed `main`, tagged **v0.2.1** → Windows `.exe` GitHub Release.

**Next steps:** await next client feedback. Open follow-ups in `FEATURES.md → Planned`
(items/company edit-delete + search, Dashboard content, as-billed snapshots).

---

## 2026-06-10 — View/Edit Bills: edit (full overwrite) + delete
**Did:** (client feedback, big item #2)
- **Renamed** sidebar + page "Saved Bills" → **View/Edit Bills** (route unchanged).
- **Backend:** `GetPurchaseBill(id)`, `UpdatePurchaseBill(bill)` (overwrite: UPDATE header +
  DELETE all lines + re-insert; extracted shared `insertBillItems`), `DeletePurchaseBill(id)`
  (cascade). Exposed on `app.go`; bindings regenerated.
- **Edit reuses the bill form:** `AddPurchaseBill` now also serves `/purchase-bills/:id/edit`
  (via `useParams`). Edit mode prefills header + lines from `GetPurchaseBill`/`ListItemsByCompany`,
  shows an "Edit purchase bill" heading + **Update bill** button, and saves via
  `UpdatePurchaseBill` then `navigate('/purchase-bills')`.
- **Detail Edit/Delete:** `BillDetail` gained **Edit bill** + **Delete** (controlled confirm
  `AlertDialog`); parent deletes then refreshes the list.
- Verified `go build/vet/test`, `npm run build` ✅. Docs updated (UI/DECISIONS/FEATURES).

**Next steps:** verify live in `wails dev` (create → view → edit overwrite → delete). This
completes the two big client items + batch-1 quick wins → ready to commit and cut **v0.2.1**
(ask before marking the In-Progress features Shipped).

---

## 2026-06-10 — Items belong to a company (FK) + company-first bill flow
**Did:** (client feedback, big item #1)
- **Schema:** `items` reshaped to `id` PK + `company_id` FK → companies, unique
  `(company_id, name, pack_size)`. `purchase_bill_items` now uses `item_id` FK → items(id)
  (dropped stored `item_name`/`item_pack_size`). Migrations reordered: companies(1) → items(2)
  → purchase_bills(3) → purchase_bill_items(4).
- **Go:** `Item` gains id/companyId/companyName(JOIN); `AddItem(companyID,…)`; new
  `ListItemsByCompany`; `ListItems` JOINs company name. `PurchaseBillItem` gains
  itemId(write) + itemName/itemPackSize/gstPercent(JOIN read); `ListPurchaseBills` JOINs
  items. Updated `db_test.go`. Bindings regenerated.
- **Frontend:** Items page → company picker (required) + Company column. `ItemCombobox` gains
  `disabled`/`placeholder`. `NewItemDialog` gains a company picker (defaults to bill company,
  all-required). `AddPurchaseBill` → company-first: items fetched per company, item dropdown
  disabled until a company is chosen, company-change confirm+reset (combobox key-bump resync),
  add-item attaches to the line only if same company, save sends `itemId`. `SavedBills`
  simplified — dropped the ListItems/GST map; uses `it.gstPercent` from the JOIN. (Also
  removed a stray NUL byte found in SavedBills' old `itemKey`.)
- Verified `go build/vet/test`, `npm run build` ✅. Docs updated (DATA_MODEL/DECISIONS/
  FEATURES). `CompanyCombobox.onAddNew` made optional (pick-only in the item dialog).

**⚠️ Action needed:** edits existing migrations → **reset the dev DB** (delete `inventory.db`
or Settings → Database → Wipe) before next run.

**Next steps:** verify live in `wails dev` (per the plan's checklist); then client feedback
big item #2. Ship v0.2.x after this batch. **Ask before marking Shipped.**

---

## 2026-06-09 — Client feedback batch 1 (quick wins)
**Did:** (six items from the client's v0.2.0 review)
1. **Date → `dd-mmm-yyyy`** (month in words). New shared `frontend/src/lib/date.ts`
   (`formatDate`/`todayDate`/`parseDate`); `AddPurchaseBill` uses it (dropped its local
   `*DDMMYYYY` helpers); made the canonical format/pattern.
2. **Final Rate** fixed to `(Bill Value / (Tax Qty + D Qty)) / Pack Size` in shared
   `lib/purchaseBill.ts` (Add + Saved both update).
3. **Running totals** expanded to Tax Qty, Tax Value, D Qty, D Value, GST Amount, Tax Bill
   Amount, Bill Value, Discount (excl. Pack Size, GST %, Billing Rate, Final Rate, Remarks) —
   both the Add footer and the Saved-bill detail footer.
4. **Darker input borders** — `--input` token darkened (heavier than `--border`) in `index.css`.
5. **Maximised launch + Logout** — `WindowStartState: options.Maximised` (`main.go`); new
   `App.Quit()` (`runtime.Quit`); sidebar **footer Logout** with a "Close GopalOne?" confirm.
6. **Save button centered** on Add Purchase Bill (`justify-end` → `justify-center`).
- Verified `go build ./...`, `wails generate module`, `npm run build` ✅. Docs updated
  (`UI.md`, `DECISIONS.md`).

**Next steps:** verify live in `wails dev`; then the rest of the client feedback. Ship a v0.2.x
release once this batch is confirmed.

---

## 2026-06-09 — Master add-forms: submit guard + dirty warning (now a pattern)
**Did:**
- **Items** and **Companies** add-forms now follow the Add Purchase Bill convention: **all
  fields mandatory** → `Add` disabled until `isValid` (every field non-empty after trim; `0`
  counts as filled), and the **unsaved-changes guard** wired (`setDirty(isDirty)` effect +
  clear on unmount) so leaving with typed-but-unsaved input warns first.
- **Codified as a required pattern** for all future data-entry pages in `docs/DECISIONS.md`
  (+ a pointer in `docs/UI.md` conventions).
- Verified `npm run build` ✅.

---

## 2026-06-09 — Settings page: Database management
**Did:**
- **Configurable DB location, persisted.** New `internal/db/config.go` (`Config{dbPath}`,
  `LoadConfig`/`SaveConfig`, `ActivePath`) + factored `db.AppDir()` out of `DefaultPath`.
  `db.WipeAt` deletes the DB file (+ `-wal`/`-shm`/`-journal` sidecars) and re-`OpenAt`s a
  fresh schema. `app.go` `startup` now opens `ActivePath()` with a **fallback to default**
  (and config reset) if the saved path fails.
- **New bound methods:** `GetDatabasePath`, `OpenExistingDatabase`, `CreateNewDatabase`
  (native Wails `OpenFileDialog`/`SaveFileDialog`, `*.db`), `WipeDatabase`. `switchTo` opens
  the new DB first and swaps the live `*sql.DB` only on success. Bindings regenerated.
- **Settings page** (`/settings`, `src/pages/Settings.tsx`) in a new sidebar **footer** (gear).
  Database section: current path display, Open/Create buttons, and a **Wipe** danger zone
  behind a **controlled** `AlertDialog` (avoids the React-18 `asChild`-over-Button ref bug).
  Switching/wiping does `window.location.reload()` so all pages re-read the new DB.
- Verified `go build ./...`, `go vet ./...`, `go test ./internal/db`, `npm run build` ✅.
  Updated `docs/DATA_MODEL.md`, `docs/UI.md`, `docs/FEATURES.md`, `docs/DECISIONS.md`.

**Next steps:** verify live in `wails dev` (switch/create/wipe + restart persistence + bad-path
fallback); then company edit/delete; more settings sections / backup-export later. **Ask before
marking Settings Shipped.**

---

## 2026-06-09 — Company↔bill FK (surrogate id)
**Did:** (supersedes the "no FK yet" note in the entry below, same session)
- **Schema:** `companies` gained an **`id` PK** (`name` now `UNIQUE`); `purchase_bills.company`
  (TEXT) replaced by **`company_id INTEGER NOT NULL` FK → `companies(id)`**. Reordered
  migrations so `companies` is **id 2** (before `purchase_bills`, id 3; line items id 4).
- **Go:** `db.Company` gains `id`; `AddCompany` returns it (LastInsertId). `db.PurchaseBill`
  swaps `company` for **`companyId`** (written) + read-only **`companyName`** (JOIN on read);
  `ListPurchaseBills` JOINs `companies`. Bindings regenerated.
- **Frontend:** `CompanyCombobox` value is now `db.Company | null` (carries the id);
  `AddPurchaseBill` tracks the selected company object, saves `companyId`, resets to `null`.
  `SavedBills` reads `bill.companyName`. `Companies` table keyed by `id`.
- Verified `go build ./...`, `go test ./internal/db`, `npm run build` ✅. Updated
  `docs/DATA_MODEL.md`, `docs/UI.md`, `docs/FEATURES.md`, `docs/DECISIONS.md`.

**⚠️ Action needed:** this **edits existing migrations**, so the dev DB must be **reset** —
delete `~/Library/Application Support/gopal-v2/inventory.db` (mac) /
`%APPDATA%\gopal-v2\inventory.db` (Windows) before next run.

**Next steps:** verify live (after DB reset); company edit/delete + more company columns.

---

## 2026-06-09 — Company master (like Items)
**Did:**
- **New `companies` master** (`name` PK, just a name for now). Backend: `internal/db/companies.go`
  (`Company`, `AddCompany`, `ListCompanies`), migration id 4, exposed on `App`, bindings
  regenerated.
- **Companies page** (`/companies`, `src/pages/Companies.tsx`) under *Masters* in the sidebar —
  mirrors the Items page (count + add card + table, add-only).
- **Inline pick/add on the bill header:** Company changed from a free-text `Input` to a
  `CompanyCombobox` (`src/components/CompanyCombobox.tsx`) backed by a cached company list,
  with **add-new-company on the fly** via `NewCompanyDialog` (`src/components/NewCompanyDialog.tsx`).
  `AddPurchaseBill` now caches companies on load and sets the company via select/create.
- `purchase_bills.company` still stores the **name as text** — no FK yet (would need reordering
  the existing migration; deferred, see `DECISIONS.md`).
- Verified `go build ./...`, `go test ./internal/db`, `npm run build` ✅. Updated
  `docs/DATA_MODEL.md`, `docs/UI.md`, `docs/FEATURES.md`, `docs/DECISIONS.md`.

**Next steps:** review/verify live; company edit/delete + more company columns; add the
`company → companies(name)` FK in a schema-reset pass. **Ask before marking Company master
Shipped.**

---

## 2026-06-09 — Sidebar navigation + Saved Bills view
**Did:**
- **Navigation → persistent collapsible sidebar.** Replaced the top-bar nav chips with a
  shadcn `sidebar` (`collapsible="icon"`). New `src/components/AppSidebar.tsx` holds the
  brand + **grouped** links (Dashboard · *Purchases*: Add Purchase Bill / Saved Bills ·
  *Masters*: Items) and now owns the unsaved-changes guard (moved out of `Nav.tsx`, which is
  **deleted**). `App.tsx` rewritten to `SidebarProvider` › `AppSidebar` + `SidebarInset`
  (no top bar). The **collapse toggle is a hamburger in the sidebar header itself** (top-left),
  not a separate element. Active route uses **exact-path** match so `/purchase-bills` and
  `/purchase-bills/new` don't both highlight.
- **Saved Bills view** (`/purchase-bills`, new `src/pages/SavedBills.tsx`). Backend:
  `ListPurchaseBills` (`internal/db/purchase_bills.go` + exposed on `App`) returns all bills
  (header + lines), newest first. UI is **list → detail**: a clickable table (Bill # /
  Company / Date / item count / Bill Value total), clicking opens a read-only line grid (same
  columns as Add) with a Totals row and a Back button.
- **Shared formulas.** Extracted `num`/`fmt`/`calcLine` into **`src/lib/purchaseBill.ts`**;
  both Add and Saved screens use it (one source of truth for the calc columns). `AddPurchaseBill`
  refactored to a thin wrapper; renamed calc fields (`totalTaxBillAmount`→`taxBillAmount`,
  `totalBillValue`→`billValue`, `finalBillingRate`→`billingRate`).
- Verified `go build ./...`, `go test ./internal/db`, and `npm run build` ✅. Regenerated Wails
  bindings. Updated `docs/UI.md`, `docs/FEATURES.md`, `docs/DECISIONS.md` (2 entries).

**Decisions:** sidebar over burger+chips (desktop app, collapses to rail for width, groups
pages); Saved-bill calc columns recompute with the **live** item GST% (not stored as-billed) —
noted snapshotting `gst_percent` onto the line as the future fix. Both in `DECISIONS.md`.

**Note:** No React-18 ref gotcha here — the shadcn sidebar is React-19-style (function
components + `Slot`), `SidebarTrigger` renders our `Button` without `asChild`, and
`SidebarProvider` bundles the `TooltipProvider`.

**Next steps:** review/verify Saved Bills live (`wails dev`); then Items edit/delete + search;
consider snapshotting GST% as-billed; Dashboard content. **Ask before marking Saved Bills
Shipped** in `FEATURES.md`.

---

## 2026-06-08 — Save validation, unsaved-changes guard, NumberInput on Items
**Did:**
- **Items spinner fix:** Pack Size / GST % / HSN on the Items page **and** the on-the-fly
  `NewItemDialog` now use `NumberInput` (no up/down spinner), matching the line-items
  convention. Only the Item *name* stays a plain text `Input`.
- **Save gating (Add Purchase Bill):** the "Save purchase bill" button is now
  `disabled` until the form is valid — header (Company, Bill number, a real dd/mm/yyyy
  date) filled, **≥1 complete line**, and **no partially-filled line**. Mandatory line
  fields = item + Tax Qty / Tax Value / D Qty / D Value; **Discount + Remarks optional**.
  Added `lineTouched` / `lineComplete` helpers.
- **Unsaved-changes guard:** new `UnsavedChangesProvider` (`src/components/UnsavedChanges.tsx`,
  `{dirty,setDirty}`) wraps the app in `App.tsx`. Add Purchase Bill reports `isDirty` via
  effect (clears on save/reset/unmount). `Nav` intercepts chip clicks while dirty and shows a
  shadcn **`alert-dialog`** — "Stay and save" vs "Switch anyway" (discard + navigate). Added
  the `alert-dialog` component.
- Verified `npm run build` ✅. Docs: updated `docs/UI.md` (save validation, nav guard, Items
  NumberInput).

**Note:** react-router v7 `useBlocker` needs a data router; we use `<HashRouter>`+`<Routes>`,
so the guard is implemented at the Nav-click level instead (the only nav path in the webview).

**Next steps:** unchanged — saved-bills view; items edit/delete; date handling.

---

## 2026-06-07 — Add Purchase Bill: line-items polish
**Did:**
- **`NumberInput`** (`frontend/src/components/NumberInput.tsx`): plain text box, no up/down
  spinner, accepts digits + one decimal only (`inputMode="decimal"`). Replaced all five
  numeric line inputs (Tax Qty / Tax Value / D Qty / D Value / Discount).
- **Reordered + renamed** line-item columns. New order: Item · Pack Size · GST % · Tax Qty ·
  Tax Value · D Qty · D Value · **GST Amount · Tax Bill Amount · Bill Value · Billing Rate ·
  Final Rate** (shaded calc band) · Discount · Remarks · delete. Renames: Total Tax Bill Amt
  → Tax Bill Amount, Total Bill Value → Bill Value, Final Billing Rate → Billing Rate.
- **Tighter table:** headers now center-aligned + wrapping (dropped `whitespace-nowrap`),
  qty cols narrowed to `w-14`, reduced padding.
- **Running totals:** replaced the single "Bill total" with a `<tfoot>` "Totals" row showing
  live sums under **Tax Bill Amount** and **Bill Value**.
- **Date field:** kept the `dd/mm/yyyy` text box and **added a calendar popover** (shadcn
  `calendar` + `popover`). Helpers `fmtDDMMYYYY` / `parseDDMMYYYY` sync both to one `date`
  string. Note: shadcn pulled **react-day-picker v10**, whose `ClassNames` renamed `table` →
  `month_grid`; patched the generated `calendar.tsx` accordingly so `tsc` passes.
- Verified `npm run build` ✅. Docs: updated `docs/UI.md` (NumberInput convention, new
  column spec, date picker).

**Decision:** Discount + Remarks were absent from the client's column list → confirmed with
user to **keep both, appended after Final Rate** (not removed).

**Process note:** per user, **ask before moving any feature to Shipped** in `FEATURES.md`.
Add Purchase Bill stays as-is (already listed Shipped) — still iterating on it.

**Next steps:** unchanged — saved-bills view; items edit/delete; date handling.

---

## 2026-06-07 — Pushed to GitHub + Windows build/release CI
**Did:**
- Created **public** GitHub repo `thegamer1907/gopal-v2` and pushed `main`.
- Added **`.github/workflows/build-windows.yml`**: on a `v*` tag push, builds on
  `windows-latest` (Go 1.25 + Node 20 + Wails v2.12.0, `wails build -platform
  windows/amd64`), renames the binary to `gopal-v2-<tag>-windows-amd64.exe`, and publishes
  a **GitHub Release** with the `.exe` attached. Manual `workflow_dispatch` runs upload the
  `.exe` as an artifact instead (no release).
- Cut **v0.1.0** to verify the pipeline end-to-end — green. Public direct-download link:
  `https://github.com/thegamer1907/gopal-v2/releases/download/v0.1.0/gopal-v2-v0.1.0-windows-amd64.exe`

**Notes / decisions:**
- Chose **Release** over Actions artifact for sharing: artifacts require a GitHub login and
  expire (≤90 days); Release assets on a public repo are a no-login, non-expiring link.
- Build is **unsigned** → Windows SmartScreen prompts on first launch ("More info → Run
  anyway"). Code signing needs a paid cert; skipped for single-user handoff.
- CI warnings (non-blocking): Node-20 actions deprecation (~Sep 2026) and `windows-latest`
  redirect to a newer image. Bump action versions later.

**How to release going forward:** `git tag vX.Y.Z && git push origin vX.Y.Z`.

**Next steps:** unchanged — saved-bills view; items edit/delete; date handling.

---

## 2026-06-05 — Layout: full-bleed shell + scroll fixes
**Did:**
- Made the app shell **full-width / full-height**: `html/body/#root` are 100% tall
  (`index.css`); `App.tsx` is a flex column with a fixed header and a `flex-1 overflow-auto`
  main, no max-width cap — pages now fill the window and resize with it. Dashboard centers
  in the full area.
- Fixed a stray **vertical scrollbar** on the line-items grid: an `overflow-x-auto`
  container is forced to `overflow-y: auto`, and the item-search dropdown made it scroll.
  `ItemCombobox` now renders its list in a **portal** (fixed under the input, tracks
  scroll/resize), so the grid scrolls horizontally only and the dropdown isn't clipped.
- Verified `npm run build` ✅.

**Next steps:** unchanged from below (saved-bills view; items edit/delete; date handling).

---

## 2026-06-05 — Add Purchase Bill: full UI + persistence
**Did:**
- **Go:** `db.PurchaseBill`/`db.PurchaseBillItem` + transactional `AddPurchaseBill`
  (`internal/db/purchase_bills.go`); exposed via `app.go`. Wails bindings auto-regenerated
  (a `wails dev` watcher is regenerating `frontend/wailsjs/...` on Go save).
- **Frontend (Add Purchase Bill page):**
  - Caches all items on load (`ListItems`).
  - `ItemCombobox` (light custom search): type → suggestions “name · pack size” → select
    fills the line (Pack Size / GST % shown read-only).
  - Inputs Tax Qty / Tax Value / D-Qty / D-Value / Discount / Remarks; **calculated**
    columns (GST Amt, Total Tax Bill Amt, Total Bill Value, Final Rate, Final Billing Rate)
    computed live per the agreed formulas. Bill total = Σ Total Bill Value.
  - `NewItemDialog` (added a shadcn-style `dialog` ui component): "add as new item" when no
    match → `AddItem` → pushed into cache + selected.
  - Save → `AddPurchaseBill`, confirmation + form reset.
  - Date is a dd/mm/yyyy text field (defaults to today), stored as entered.
- Brought **Items** screen in sync with the numeric items schema (pack size/HSN numbers,
  composite key) so the build is green.
- Verified: `go test ./...` ✅, `go build ./...` ✅, `npm run build` ✅.

**Notes / decisions:**
- **Discount** is captured + stored but unused by any formula (flagged to user).
- Calculated columns are derived in the UI, **not stored**.
- Line table is a wide horizontally-scrollable `<table>` (16 cols).

**Next steps:**
- A **view/list of saved bills** (currently write-only).
- Consider validating/normalising the dd/mm/yyyy date; revisit if sorting needed.
- Items edit/delete.

---

## 2026-06-05 — Purchase bill schema (two tables)
**Did:**
- Added the purchase bill schema as **two tables** (user's choice):
  - `purchase_bills` (header): `id` (surrogate PK), `company`, `bill_number`, `date`.
  - `purchase_bill_items` (lines): `id`, `bill_id` (FK → bill, ON DELETE CASCADE),
    `item_name` + `item_pack_size` (**composite FK → items(name, pack_size)**), plus
    `tax_qty`, `tax_value`, `d_qty`, `d_value`, `discount`, `remarks`. All numeric cols
    are REAL; `remarks` is TEXT.
- Defined in `internal/db/migrate.go`; documented in `DATA_MODEL.md`.
- **Schema only** — no Go structs/CRUD/bindings/UI for bills yet (deferred while
  iterating). Verified `go build ./...` ✅ and `go test ./internal/db` ✅ (migrations,
  incl. the composite FK, apply on a fresh DB).

**Next steps:**
- Continue schema iteration as needed, then add Go CRUD + bindings + UI for bills.
- Still pending from before: update the **Items UI** to the new items schema.

---

## 2026-06-05 — Item master schema (items table)
**Did:**
- Defined the **item master** schema. `items` columns: **Item** (`name` TEXT), **Pack
  Size** (`pack_size` REAL), **GST %** (`gst_percent` REAL), **HSN** (`hsn` INTEGER).
  **Primary key = composite `(name, pack_size)`** (no surrogate id). All of pack size /
  GST / HSN are numeric. Recorded in `DATA_MODEL.md`.
- **No migration ceremony** during this fast-iteration phase: single schema definition in
  `migrate.go`, edited in place; reset the dev DB to apply changes (deleted the local
  `inventory.db`). Real migrations deferred until there's data to protect.
- Go: rewrote `db.Item` + `AddItem`/`ListItems` (`internal/db/items.go`); updated `app.go`
  binding (`AddItem(name string, packSize, gstPercent float64, hsn int64)`) and the db
  test. Wails JS bindings updated to match.
- **UI deliberately untouched** (per request: schema first). The Items screen still
  references the old shape and won't typecheck — to be fixed in a later UI pass.
- Verified backend only: `go test ./internal/db` ✅, `go build ./...` ✅.
  (Frontend `npm run build` intentionally skipped — UI not updated yet.)

**Next steps:**
- Update the **Items UI** to the new schema (Item / numeric Pack Size / GST % / numeric
  HSN; composite key, no id) once we're done iterating the schema.
- Items: add **edit/delete** later.
- Wire **Add Purchase Bill** line items to pick from the item master.

---

## 2026-06-05 — Navigation shell + Add Purchase Bill screen (UI)
**Did:**
- Added app navigation: top-bar **nav chips** (Dashboard · Add Purchase Bill · Items)
  via **`react-router-dom` + `HashRouter`**. New structure: `src/pages/` for screens,
  `src/components/Nav.tsx` for the chips; `App.tsx` is now the layout + routes.
- **Dashboard** (`/`) — placeholder landing page showing a centered "Hare Krishna".
- **Add Purchase Bill** (`/purchase-bills/new`) — UI shell: header card (Company name,
  Bill number, Date) + line-items table (product/qty/unit price/per-line total, add &
  delete rows, running grand total). **Not persisted** — Save logs to console for now.
  (Renamed from "New Purchase Order" → "Add Purchase Bill" mid-session.)
- Moved the items skeleton into `src/pages/Items.tsx` (`/items`), still reachable.
- Verified: `npm run build` ✅ and `go build ./...` (embed) ✅.

**Decisions:** see `DECISIONS.md` (2026-06-05: routing = react-router-dom / HashRouter).

**Next steps:**
- Design the **Purchase Bill data model** in `DATA_MODEL.md` (bill header + line items),
  add the migration + Go methods (`internal/db`, `app.go`), then wire the Add Purchase
  Bill form to persist.
- Decide real **Dashboard** content (what KPIs / lists to show).

---

## 2026-06-04 — Frontend stack: shadcn/ui + Tailwind v4
**Did:**
- Chose the UI stack with the user: **shadcn/ui** (new-york, neutral) on **Tailwind v4**,
  **light theme only**. Recorded in `DECISIONS.md` / `UI.md`.
- Bumped the frontend toolchain (Vite 3→6, TS 4.6→5.9, plugin-react 2→4); React stays 18.
- Set up Tailwind v4 (`@tailwindcss/vite`), `@/`→`src/` alias, `src/index.css` theme tokens
  (light, Nunito font), `cn()` util, `components.json`.
- Added shadcn components (button, input, label, card, table) and rebuilt the items screen
  with them (header + add-item card + items table + empty state).
- Verified: `npm run build` ✅ and `go build ./...` (embed) ✅. Removed unused template CSS.

**Decisions:** see `DECISIONS.md` (2026-06-04: shadcn/Tailwind v4/light; toolchain bump).

**Next steps:**
- Brainstorm the real inventory feature set + domain model (replace the `items` skeleton).
- Design the real screens using the frontend-design skill once the model is defined.

---

## 2026-06-04 — Foundation & context system
**Did:**
- Defined the cross-session context system: `docs/` (committed, source of truth) +
  Claude memory (secondary). Created `PROJECT.md`, `FEATURES.md`, `DECISIONS.md`,
  `DATA_MODEL.md`, `UI.md`, `WORKLOG.md`.
- Updated root `CLAUDE.md` with the Project Context + context-sync workflow.
- Locked foundational decisions (see `DECISIONS.md`): SQLite single-file local storage,
  single-user/local, pure-Go `modernc.org/sqlite` driver, local git, Windows build deferred.
- Added the Go SQLite data layer (`internal/db`) and the minimal `items` vertical slice
  (`AddItem`/`ListItems` + basic React screen) to prove the stack.
- Initialized git and made the foundation commit.

**Decisions:** see `DECISIONS.md` (all dated 2026-06-04).

**Next steps:**
- Brainstorm the real inventory feature set with the user/client; record in `FEATURES.md`.
- Design the real domain model (replace the `items` skeleton) in `DATA_MODEL.md`.
- Decide the UI approach (plain CSS vs. component library) and start the real UI in `UI.md`.

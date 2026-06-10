# Work Log

Session journal — **newest entry on top**. Each entry: what we did, decisions made, and
explicit next steps. This is the primary "start where we left off" file: a new session
reads the top entry first.

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

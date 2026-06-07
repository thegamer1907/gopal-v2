# Work Log

Session journal — **newest entry on top**. Each entry: what we did, decisions made, and
explicit next steps. This is the primary "start where we left off" file: a new session
reads the top entry first.

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

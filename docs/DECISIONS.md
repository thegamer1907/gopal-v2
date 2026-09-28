# Decision Log

Append-only. Newest at the bottom. Each entry: **date · decision · why · alternatives
considered**. Record any decision (product or technical) that future sessions shouldn't
have to re-litigate.

---

### 2026-06-04 — Storage: SQLite, single local file
- **Decision:** Use SQLite, stored as a single `.db` file, auto-created on first launch
  in the per-user app folder resolved via Go's `os.UserConfigDir()`
  (`%APPDATA%\gopal-v2\inventory.db` on Windows).
- **Why:** Relational data (inventory) needs real queries; SQLite is zero-setup for the
  end user, reliable, and the whole DB is one portable file (backup = copy the file).
- **Alternatives:** JSON/flat files (too fragile/slow as data grows); server/cloud DB
  (unneeded — single user, local only).

### 2026-06-04 — Users: single-user, local only
- **Decision:** Design for one user on one machine. No auth, no sync, no server.
- **Why:** That's the client's actual use case. Keeps everything simple.
- **Alternatives:** Multi-user shared / multi-device sync — deferred; data layer kept
  swappable should this ever change.

### 2026-06-04 — SQLite driver: modernc.org/sqlite (pure Go)
- **Decision:** Use the pure-Go `modernc.org/sqlite` driver.
- **Why:** No CGO/gcc toolchain required — keeps `wails dev` simple on Mac and makes the
  eventual Windows build far less painful.
- **Alternatives:** `mattn/go-sqlite3` (CGO; faster but cross-compilation headaches).

### 2026-06-04 — Version control: local git only
- **Decision:** Initialize git locally; no remote/GitHub for now.
- **Why:** Gives durable history and makes the repo (incl. `docs/` context) portable
  between Mac and Windows. Remote can be added later.

### 2026-06-04 — Windows build: deferred
- **Decision:** Develop on Mac with `wails dev`; figure out Windows packaging closer to
  delivery (likely on a Windows machine or via CI).
- **Why:** Wails Mac→Windows cross-compilation is unreliable; packaging doesn't block
  development.

### 2026-06-04 — Cross-session context lives in repo `docs/`
- **Decision:** Keep all durable project context in committed `docs/` files; Claude
  memory is secondary (machine-local, doesn't travel to Windows).
- **Why:** The repo is the portable source of truth that survives across sessions and
  machines.

### 2026-06-04 — UI: shadcn/ui + Tailwind v4, light theme only
- **Decision:** Build the frontend with **shadcn/ui** (new-york style, **neutral** base)
  on **Tailwind CSS v4**, with a **light-only** theme. Nunito as the UI font; `@/` path
  alias → `src/`. Components live in `src/components/ui/` (owned, editable, copied in by
  the shadcn CLI — not a runtime dependency).
- **Why:** shadcn gives accessible, sleek table/form/dialog primitives ideal for a
  data-entry app, with nothing phoning home (fits a single-user offline Windows app).
  Light-only matches a business/office use case and keeps setup simple.
- **Alternatives:** plain React + CSS (slower to a polished look); Tailwind v3 (mature
  but being superseded); dark/both themes (deferred — easy to add later via a `.dark` block).

### 2026-06-04 — Frontend toolchain bumped to current
- **Decision:** Upgrade the template's 2022-era toolchain: Vite 3→6, TypeScript 4.6→5.9,
  `@vitejs/plugin-react` 2→4. React stays on 18.
- **Why:** shadcn's CLI and Tailwind v4 tooling expect modern Vite/TS; the old versions
  fight the tooling. Verified `npm run build` and `go build ./...` (embed) still pass.

### 2026-06-05 — Routing: react-router-dom with HashRouter
- **Decision:** Use `react-router-dom` for multi-page navigation, wrapped in
  **`HashRouter`** (not `BrowserRouter`). Top-of-app **nav chips** (`NavLink`) are the
  primary navigation; add a page by creating it under `src/pages/`, then adding a
  `<Route>` in `App.tsx` and a chip entry in `src/components/Nav.tsx`.
- **Why:** The app is served from inside the Wails webview (no real HTTP server / history
  API for deep links); `HashRouter` routes purely via the URL fragment, which is robust in
  that embedded/`file://`-style context. `react-router` is the standard and scales as the
  page count grows.
- **Alternatives:** Hand-rolled `useState` view switch (fine for 2 pages, gets messy as
  pages/links grow); `BrowserRouter` (needs server-side fallback routing — fragile in a
  webview).

### 2026-06-07 — shadcn components are React-19 style on React 18 → avoid `asChild` over our `Button`
- **Decision:** Don't wrap our shadcn `Button` in a Radix `asChild` trigger
  (`PopoverTrigger`/`DropdownMenuTrigger`/etc.). Instead let the Radix `*Trigger` render its
  own real `<button>` and style it with `cn(buttonVariants({...}), "...")`.
- **Why:** The generated shadcn (new-york) components are the **React 19** style — `Button`
  is a plain function component that takes `ref` as a prop, with **no `forwardRef`**. The
  project runs **React 18.3.1**, where a function component can't receive a `ref`. So an
  `asChild` trigger's ref silently fails to attach (console warns *"Function components
  cannot be given refs"*), Radix has no element to anchor to, and e.g. the Popover never
  opens. Hit this with the Add Purchase Bill date picker.
- **Alternatives:** (a) Upgrade to React 19 — deferred (no need yet; wider blast radius).
  (b) Add `forwardRef` back to `Button` — diverges from the shadcn template. The styled
  `*Trigger` approach is local and keeps the templates untouched.
- **Note:** Calendar day-buttons pass a ref to `Button` too; on React 18 that only disables
  keyboard focus-follow (harmless), not clicks.

### 2026-06-09 — Navigation: persistent collapsible sidebar (not burger + chips)
- **Decision:** Replace the top-bar nav chips with a **persistent left sidebar** (shadcn
  `sidebar`, `collapsible="icon"`) holding **grouped** links; a header trigger collapses it
  to an icon-only rail. Deleted `Nav.tsx`; the guard + nav live in `AppSidebar.tsx`.
- **Why:** This is a desktop business app run maximized all day — a burger menu is a
  space-saving *mobile* pattern that hides nav behind a click for no benefit here. A
  persistent sidebar keeps every page one click away, **groups** related screens (scales as
  pages grow), and **collapses to a rail** to reclaim width for the wide bill grid — which is
  the only real reason you'd want a burger. Running chips *and* a sidebar would be two
  redundant nav systems.
- **Alternatives:** Burger + overlay sidebar + chips (user's first idea — redundant, nav
  hidden); keep chips (doesn't scale / no grouping).

### 2026-06-09 — Saved-bill calc columns: recompute with the *live* item GST%
- **Decision:** The Saved Bills view recomputes the calculated columns (GST amount, totals,
  rates) from the stored raw fields, looking up **GST%** from the **current** item master by
  `(name, pack size)` — `purchase_bill_items` stores `item_pack_size` but **not** `gst_percent`.
  Missing item → GST% 0.
- **Why:** Keeps the read UI scoped (no schema change) and the formula in one place
  (`src/lib/purchaseBill.ts`). Fine while GST rates are stable.
- **Limitation / follow-up:** A bill is a historical document; if an item's GST% later
  changes, the saved bill's recomputed totals shift with it. The correct fix is to **snapshot
  `gst_percent` onto `purchase_bill_items` at save time** (schema + AddPurchaseBill change) —
  deferred until we decide we need it.

### 2026-06-09 — Company is a master list (like Items); no FK on the bill yet
- **Decision:** Promote the bill's **Company** from a free-text field to a **master list**
  (`companies` table, `name` PK — just a name for now). It gets its own *Masters* page and is
  picked/created inline on the bill via `CompanyCombobox` + `NewCompanyDialog`, exactly
  mirroring the Items pattern. `purchase_bills.company` still stores the **name as text**
  (no foreign key yet).
- **Why:** Consistency and data hygiene — companies recur across bills, so they belong in a
  master (enables future columns: GSTIN, address, etc.). Skipping the FK for now avoids
  reordering/altering the existing `purchase_bills` migration (FK would need `companies` to
  exist first) while there's no real data to protect.
- **Follow-up:** add `FOREIGN KEY (company) REFERENCES companies(name)` once we do a schema
  reset/migration pass; company edit/delete; more company columns.

### 2026-06-09 — Company↔bill link: surrogate `companies.id` + FK (supersedes "no FK yet")
- **Decision:** Reverse the earlier "no FK yet" call. `companies` now has an
  **`id INTEGER PK AUTOINCREMENT`** with `name TEXT UNIQUE`; `purchase_bills.company` is
  replaced by **`company_id INTEGER NOT NULL` with `FOREIGN KEY (company_id) REFERENCES
  companies(id)`**. Migrations reordered so `companies` (id 2) is created before
  `purchase_bills` (id 3). `db.PurchaseBill` gains `companyId` (written) + read-only
  `companyName` (JOIN on read); `ListPurchaseBills` JOINs `companies` for the name.
- **Why:** User chose the more future-proof shape — a surrogate id means renaming a company
  doesn't orphan its bills, and FK enforcement (already on via `_pragma=foreign_keys(1)`)
  guarantees every bill points at a real company. Worth doing now while there's no data.
- **Cost:** This **edits existing migrations**, so the dev DB must be reset (delete
  `inventory.db`) to pick it up — fine per the current iteration policy (no real data yet).
- **Still open (at the time):** company edit/delete. (Shipped 2026-06-15; company stays
  name-only — no extra columns planned.)

### 2026-06-09 — Configurable DB location, persisted in config.json
- **Decision:** The database file is user-selectable (Settings → Database). The active path is
  persisted in **`config.json`** (`{ "dbPath": … }`) next to the default DB; startup resolves
  it via `db.ActivePath()` (configured path, else default) and opens with `db.OpenAt`. Support
  **open-existing**, **create-new** (native Wails `OpenFileDialog`/`SaveFileDialog`), and
  **wipe** (`db.WipeAt` deletes the file + sqlite sidecars, then re-`OpenAt` to recreate the
  schema). Switching opens the new DB **first**, swapping the live `*sql.DB` only on success.
- **Why:** Lets the user point the app at a backup / a synced file / a fresh database, and
  start over cleanly — without touching the binary. Persisting makes the choice stick.
- **Resilience:** if the saved path fails to open at startup, fall back to the default and
  reset the config so a bad/removed path can't brick the app.
- **Refresh after switch:** the frontend does a full `window.location.reload()` rather than a
  cross-page cache-invalidation system — simplest reliable way to re-read every page's cached
  data against the new DB.
- **Note:** the wipe confirm uses a **controlled** `AlertDialog` (not `AlertDialogTrigger
  asChild` over our `Button`) per the React-18 ref decision above.

### 2026-06-09 — Pattern: data-entry pages must guard submit + wire the dirty/leave warning
- **Decision:** Every page with a data-entry form follows the same two rules (established by
  Add Purchase Bill; now also Items and Companies):
  1. **Submit guard** — derive an `isValid` boolean and `disabled={!isValid}` on the submit
     button; also early-return from the handler if `!isValid`. Required fields count as
     **filled when non-empty after `.trim()`** — note `0` is a valid filled value (don't treat
     it as empty). If only *some* fields are required, validate exactly those (e.g. a bill line:
     item + the four numeric inputs; Discount/Remarks optional).
  2. **Unsaved-changes guard** — derive `isDirty` (any required/meaningful field has content),
     then `useEffect(() => setDirty(isDirty), [isDirty, setDirty])` and
     `useEffect(() => () => setDirty(false), [setDirty])` (clear on unmount). The sidebar
     (`AppSidebar`) intercepts nav while `dirty` and shows the "Discard unsaved changes?"
     `AlertDialog`. Resetting the form after a successful save clears dirty automatically.
- **Why:** Consistent, predictable data entry — you can't submit half-filled records, and you
  can't lose typed-but-unsaved work by navigating away. Codified here so **all future pages
  follow it** without re-deciding.
- **Source of truth for `{dirty,setDirty}`:** `src/components/UnsavedChanges.tsx`
  (`useUnsavedChanges`).

### 2026-06-09 — Client feedback (batch 1): date format, formula, totals, window, borders
- **Date format = `dd-mmm-yyyy`** (month in words), as a shared pattern. All date display/entry
  goes through `frontend/src/lib/date.ts` (`formatDate`/`todayDate`/`parseDate`). Future date
  fields must reuse it (don't hand-roll formats). Client wanted the month spelled out for clarity.
- **Final Rate formula corrected** to `(Bill Value / (Tax Qty + D Qty)) / Pack Size` (was
  `× Pack Size`) in the shared `lib/purchaseBill.ts` — applies to Add + Saved Bills.
- **Running totals** now cover every line column **except** Pack Size, GST %, Billing Rate,
  Final Rate, Remarks (those don't sum meaningfully) — i.e. Tax Qty, Tax Value, D Qty, D Value,
  GST Amount, Tax Bill Amount, Bill Value, Discount, in both the Add footer and Saved detail.
- **Window starts Maximised** (`options.Maximised`), not kiosk fullscreen — keeps the OS title
  bar. Paired with an in-app **Logout** (sidebar footer → `App.Quit()` → `runtime.Quit`) behind
  a "Close GopalOne?" confirm, so a misclick can't kill the app mid-entry.
- **Input borders darkened**: `--input` set heavier than `--border` (cards/tables unchanged) so
  entry boxes are visible on the client's bright/low-contrast screen.

### 2026-06-10 — Items belong to a company (company FK); bill is company-first
- **Decision:** An item belongs to a company. `items` gets a surrogate **`id` PK** + **`company_id`
  FK** → companies(id), unique `(company_id, name, pack_size)` (same item name can exist under
  different companies). `purchase_bill_items` now references **`item_id`** → items(id) (replacing
  the stored `item_name`/`item_pack_size` + composite FK); the bill read JOINs `items` for
  name/pack/GST. Migrations reordered: companies(1) → items(2) → purchase_bills(3) →
  purchase_bill_items(4).
- **Bill flow:** the user picks the **company first**; line-item dropdowns are then fetched per
  company via `ListItemsByCompany` (not a global cache) and are disabled until a company is set.
  Changing the company when lines already have items **resets the line grid after a confirm**
  (items are company-scoped). The on-the-fly add-item dialog **defaults its company to the bill's
  company** but allows changing it; if changed to a *different* company the item is saved to the
  master only (not attached to the current line).
- **Why:** Items genuinely belong to a supplier/company in the client's workflow; this prevents
  cross-company item mix-ups and lets the same name exist per company. Surrogate id keeps it
  consistent with the companies decision and survives renames.
- **Supersedes:** the Saved Bills "live-GST-map via ListItems" note — GST/name/pack now come from
  the `items` JOIN on the line's `item_id` (still the *current* master value, not an as-billed
  snapshot).
- **Cost:** edits existing migrations → dev DB must be reset (delete `inventory.db` or Settings →
  Wipe).

### 2026-06-10 — Bill edit = full overwrite; delete with confirm; reuse the add form
- **Decision:** Renamed "Saved Bills" → **View/Edit Bills**. Editing a bill opens the **same
  purchase-bill form** (`AddPurchaseBill`) at `/purchase-bills/:id/edit` (route param), prefilled
  from `GetPurchaseBill`. Saving is a **complete overwrite**: `UpdatePurchaseBill` does
  `UPDATE` header + `DELETE` all `purchase_bill_items` + re-insert — no line diffing.
  **Delete** (`DeletePurchaseBill`) is offered from the bill detail behind a confirm dialog;
  line items go via the `ON DELETE CASCADE`.
- **Why:** The form already has all the company-first item logic, calc columns, totals, and
  dialogs — reusing it avoids duplicating ~500 lines. "Complete overwrite" matches the client's
  mental model (re-enter the bill) and keeps the backend simple/robust vs. per-line diffing.
- **Edit entry point:** from the read-only detail (row → view → Edit/Delete), per the screen's
  view-then-edit flow.
- **Note:** the delete confirm uses a **controlled** `AlertDialog` (React-18 ref note). Edit
  navigation is programmatic (`navigate`), so it isn't intercepted by the sidebar unsaved guard;
  the handler clears `dirty` before navigating.

### 2026-06-15 — Masters edit/delete; reference-guarded delete; rename-only company
- **Decision:** Items and Companies each get per-row **Edit** + **Delete**. Edit opens a
  **controlled dialog** (`EditItemDialog` / `EditCompanyDialog`) reusing the add fields —
  the item edit can also reassign the item's company. Delete uses a **controlled
  `AlertDialog`** (React-18 ref note). Backend: `UpdateItem`/`DeleteItem`,
  `UpdateCompany`/`DeleteCompany`.
- **Reference guard:** delete is refused in Go (an explicit COUNT, not raw FK failure) when
  rows still reference the master — items/bills for a company, bill lines for an item — and
  returns a friendly count message surfaced on the page.
- **Company stays name-only:** the client scope here is **edit/delete only, no schema change**.
  (GSTIN/address columns are **not** planned — don't add them unless the client asks.)
- **Items search:** a single search box filtering by item **or** company name (doubles as
  filter-by-company), instead of a separate company dropdown — no new Select component, and it
  covers the "search / filter by company" need in one control.

### 2026-06-15 — Indian number format; lightweight sortable/filterable tables; bills sorted by date
- **Decision:** All money renders **Indian-style** (`en-IN` lakh/crore grouping, 2 decimals) and
  quantities as **whole numbers** with the same grouping. Implemented as two helpers in
  `frontend/src/lib/purchaseBill.ts`: `fmt` (money) keeps its name so existing money render sites
  need no change; `fmtQty` (qty) is applied to the quantity totals/cells (SavedBills detail +
  AddPurchaseBill totals). Both use module-level `Intl.NumberFormat` instances and NaN-guard.
- **Tables:** list tables are made sortable + filterable with **lightweight custom** helpers, not a
  table library (user choice): `useTableSort` hook (`@/hooks`) + `SortableHeader` (`@/components`),
  paired with the existing `useMemo` search pattern. Tables with a date column add a
  `DateRangeFilter` (Popover + range `Calendar`, reusing the single-date picker pattern from
  AddPurchaseBill; trigger styled via `buttonVariants`, not `asChild`, per the React-18 ref note).
- **View/Edit Bills list** columns reordered to **Company · Date · Bill number · Qty · Amount**
  (Qty = Σ(taxQty+dQty); replaces the item-count column) and **defaults to date-descending**
  (newest first); unparseable dates sort to the bottom (epoch fallback). Date-range `to` bound is
  treated as **end-of-day** so the upper day is inclusive.
- **Why:** client feedback. `en-IN` is the correct grouping for the client's locale; a shared
  formatter keeps it consistent and one-line to change. Lightweight helpers avoid a dependency for
  3 small tables while still giving consistent sort/search/range UX. No backend/schema change.
- **Alternatives:** TanStack Table (rejected for now — overkill for 3 tables, adds a dep);
  per-site `toLocaleString` (rejected — drifts, easy to miss a site).

### 2026-06-15 — Navigation: flat top bar (supersedes the 2026-06-09 collapsible sidebar)
- **Decision:** Replace the persistent collapsible **left sidebar** with a **flat, always-visible
  top navigation bar** (`src/components/TopNav.tsx`): the GopalOne wordmark + every page as a link
  in one horizontal row (Dashboard · Add Purchase Bill · View/Edit Bills · Items · Companies), with
  Settings + Logout on the right. App shell becomes `div.flex.h-svh.flex-col` › `TopNav` ›
  `<main className="flex-1 overflow-auto …">`. Deleted `AppSidebar.tsx` and the now-unused
  `ui/sidebar.tsx` primitive. The unsaved-changes guard + quit confirm moved into `TopNav` unchanged.
- **Why:** Client feedback — he's uncomfortable with the sidebar, keeps **forgetting it's
  collapsible** (forgets to open/close it), and finds **vertical scrolling more natural** than a
  side rail. A flat bar keeps every page one click away with **nothing hidden** to forget about.
- **Supersedes:** the 2026-06-09 "persistent collapsible sidebar" decision. The sidebar's main
  justification was reclaiming width for the wide Add-Bill grid by collapsing — a top bar gives
  every page **full width permanently**, so that need is gone (bonus: smaller bundle, no sidebar
  primitive).
- **Chosen layout:** flat/all-visible over grouped dropdowns — dropdowns would re-introduce the
  same "hidden behind a click" problem that bothered the client. Group labels (Purchases/Masters)
  dropped; only 5 destinations, so a single row is clear on the maximised window.

### 2026-09-20 — Reports: card-grid page, Excel via excelize, math computed in the frontend
- **Decision:** New `/reports` page laid out as a **card grid** — one `Card` per report type,
  each owning its controls — so future reports are just more cards, not a redesign. First
  report: **Purchase Summary**, a line-item register (not aggregated) over a chosen date range
  or all bills. Added **`github.com/xuri/excelize/v2`** (pure Go, no CGO) as the project's first
  Excel dependency. **All report math (GST amount, totals, rates) is computed in the frontend
  via the existing `calcLine`** (`lib/purchaseBill.ts`) and handed to Go as finished rows; the
  new `internal/reports` package + `App.ExportPurchaseSummary` only lay those rows out into a
  workbook and save it (native Save dialog, mirroring `CreateNewDatabase`'s file-dialog
  pattern) — Go never re-derives the formulas.
- **Cell types/formats (explicit client ask — not left as text):** Date is a genuine Excel date
  cell with a custom `dd-mmm-yyyy` format (matches the app's own date style, still sortable);
  numeric cells are real numbers, "accounting-style": money columns (Tax Value, D Value, GST
  Amount, Tax Bill Amount, Bill Value, Billing/Final Rate, Discount) get `#,##0.00`;
  quantity/rate-support columns (Pack Size, Tax Qty, D Qty, GST %) get plain `0.00`, no
  separator; HSN stays a plain integer (`0`). A bold Totals row sums the same columns as the
  Add/View Bill line-items grid footer.
- **Read-side addition:** `items.hsn` (already existed, migration 2) is now also joined into
  `PurchaseBillItem` (`ListPurchaseBills`/`GetPurchaseBill`) since the report needs it — no
  schema/migration change.
- **Why:** Client wants a Reports area that will grow to hold several report types; the
  card-grid avoids relayout later. Formulas were kept single-sourced per the existing
  `lib/purchaseBill.ts` rule (CLAUDE.md) rather than reimplemented in Go. Real typed date/number
  cells (not text) were an explicit client requirement so the workbook is directly
  sortable/summable in Excel.
- **Alternatives considered:** a bill-level-totals-only report or a two-sheet (details +
  summary) workbook — client chose the detailed line-item register for v1; other layouts
  (single-purpose page, list+detail panel) were considered for the Reports page and rejected in
  favor of the card grid for extensibility.

### 2026-09-20 — In-app self-update: minio/selfupdate, ldflags version, checksum-verified
- **Decision:** Add a manual **"Check for Updates"** button (Settings → Updates), not a
  background/startup auto-check — the app ships as a single portable `.exe` (no
  installer), so the previously-manual "download and replace the file" step is now
  automated on request. Used **`github.com/minio/selfupdate`** to actually replace the
  running executable rather than hand-rolling the rename/relaunch dance — it has explicit
  Windows support and handles the platform-specific edge cases of overwriting a currently
  running binary, which is genuinely tricky and not something worth re-inventing/risking
  for a feature that can't be end-to-end tested on the macOS dev machine. It keeps the
  previous binary as `<exe>.old` (`Options.OldSavePath`) — one rollback generation instead
  of deleting the old build outright.
- **Version embedding:** the binary previously had **no version string anywhere** — added
  `var version = "dev"` in `main.go`, set at release-build time via
  `wails build -ldflags "-X main.version=$tag"` in `build-windows.yml` (confirmed `wails
  build` passes `-ldflags` through to the Go linker). `"dev"` (the `wails dev` default)
  doubles as a safety marker: the version-compare logic never reports an update available
  when the current version fails to parse as `vMAJOR.MINOR.PATCH`, so a stray click during
  local development can't trigger the destructive replace path.
- **Integrity check:** `build-windows.yml` now also emits a `.sha256` file next to the
  `.exe` (one extra `sha256sum` line) and publishes it as a release asset; the update
  check fetches it and passes it to `selfupdate.Apply` for verification before the binary
  is replaced. An older release cut before this shipped simply has no checksum asset —
  tolerated, verification is just skipped for that case.
- **Split for testability:** `internal/updater.Check` (network + JSON + numeric version
  comparison) is pure/portable and unit-tested directly (table-driven `isNewer` cases incl.
  the `"v0.10.0" > "v0.9.0"` double-digit case that a naive string comparison gets wrong,
  plus an `httptest`-mocked GitHub API response) — verified live against the real repo too
  (`go run` a throwaway script hitting `api.github.com/repos/thegamer1907/gopal-v2` for
  real). The actual file-replace (`App.DownloadAndInstallUpdate`) is hard-guarded to
  `runtime.GOOS == "windows"` and **could not be exercised on the macOS dev machine** —
  it needs a real Windows run (or a `windows-latest` CI job) to fully verify.
- **Why:** client asked specifically for an in-app button, not an automated background
  check. Numeric version comparison avoids a real bug class (lexicographic string compare
  breaks past single digits). Checksum verification and the rollback backup are cheap
  additions given the library and CI already do most of the work.
- **Alternatives considered:** hand-written PowerShell helper script + detached process
  (rejected — more code to get right on a platform I can't test locally, and a
  dynamically-written-and-executed script is also more likely to draw antivirus/Defender
  suspicion than a library-driven in-process replace); switching to an NSIS
  installer (rejected — bigger change to the whole release pipeline for a problem the
  portable-`.exe` self-replace pattern already solves).

### 2026-09-26 — Date format: dd-mmm-yyyy → dd-mmm-yy (2-digit year), no data migration
- **Decision:** Client feedback — dates should show a 2-digit year (`09-Jun-26`), not the
  4-digit `09-Jun-2026` used until now. Changed `formatDate` (`frontend/src/lib/date.ts`)
  to always write the 2-digit form going forward, and made `parseDate` **permanently**
  tolerant of *both* a 2-digit and the legacy 4-digit year (a 2-digit year expands as
  `2000 + yy`) rather than doing a one-time cutover. Added a new `displayDate(raw)` helper
  that normalizes any stored string to the current display form, and used it everywhere a
  raw stored date string was shown or passed along (`SavedBills.tsx`'s list row and detail
  header, `AddPurchaseBill.tsx`'s edit-prefill, `Reports.tsx`'s Excel row-building).
  `internal/reports/purchase_summary.go`'s Excel date column/format also moved to
  `dd-mmm-yy` — safe to make that the *only* layout Go understands, since the frontend
  now always normalizes before building a report row.
- **Why no data migration:** the real database already has 28+ bills stored with
  4-digit-year strings (dates are stored exactly as entered and never rewritten — see
  `docs/DATA_MODEL.md`). A `parseDate` tightened to *require* 2 digits would have stopped
  parsing every existing bill, silently breaking sort order (falls back to epoch),
  date-range filtering (excludes every old bill), the Add/Edit Save button (every existing
  bill would look "invalid" the moment it's opened), and the Excel export's date column.
  Making the parser permanently tolerant of both forms, plus normalizing at display time,
  fixes the client's complaint (every bill now *shows* `dd-mmm-yy`, old and new alike)
  without touching a single stored row — lower risk than a rewrite migration, and it keeps
  working automatically if the format is ever adjusted again.
- **Left alone:** the calendar popup's own month/year heading (e.g. "September 2026") is
  react-day-picker's own internal caption (`captionLayout="label"`, no custom
  `formatCaption`) — independent of `lib/date.ts`, and a full month name + 4-digit year is
  the normal convention for a date-picker's own header, not what the client's feedback was
  about.

### 2026-09-26 — Customers master: required fields, merged Address column
- **Decision:** First piece of a new **Sales** feature — a Customers master
  (`id, name, nick_name, address1, address2, city, state, pincode, gstin, mobile`),
  built as a new page mirroring the Companies/Items master pattern exactly (add-form
  card, sortable/searchable table, controlled Edit dialog, controlled Delete confirm).
  **Required fields: Name and City only** — every other field (including GSTIN and
  mobile) can be blank and filled in later via Edit; real customer records are often
  captured incrementally. **State is a picker** populated from a fixed `INDIAN_STATES`
  array (`frontend/src/lib/indianStates.ts`, the current 28 states + 8 union
  territories) rather than free text or a normalized lookup table — the list is small
  and effectively static, so a DB table for it would be overkill.
- **List table shows every field**, but **Address 1 and Address 2 are merged into a
  single "Address" column** (comma-joined, skipping the join when Address 2 is blank)
  rather than two separate columns — both were explicit client choices when asked.
- **`DeleteCustomer` was unguarded at first** (nothing referenced `customers` yet); now
  guarded the same way as `DeleteCompany`/`DeleteItem` (`COUNT(1)` against `sales_orders`)
  — see the 2026-09-26 Add Order entry below, which introduced that FK.
- **No format validation** on GSTIN/pincode (plain required-vs-optional checks only) —
  consistent with how Items/Companies treat their fields; both are plain text `Input`s,
  not `NumberInput`, since they're identifiers rather than quantities (same reasoning as
  `bill_number`). **Mobile is the one exception** (see client-feedback revision below).
- **Revised after client manual-testing feedback (same day):**
  - The State picker shipped first as a shadcn `Select` dropdown (`npx shadcn@latest add
    select`); the client asked for the same type-to-filter combobox interaction already
    used for Company/Item on Add Purchase Bill instead. Replaced with a new
    `StateCombobox` (`frontend/src/components/StateCombobox.tsx`, same shape as
    `CompanyCombobox` but for a plain string list, no "add new" option since the list is
    closed) and **removed `components/ui/select.tsx` entirely** — nothing uses it now.
  - Mobile got dedicated validation: **must be exactly 10 digits if provided at all**
    (still optional — empty is fine). `MobileInput` (mirrors `NumberInput`'s
    digit-filtering approach) blocks non-digit characters and caps length at 10; Add/Save
    is disabled and an inline error shows for a partial (1-9 digit) number.
- **Backend shape diverges slightly from Company/Item:** `AddCustomer`/`UpdateCustomer`
  take/return a whole `db.Customer` struct rather than flat parameters — with 9 editable
  fields, a flat signature would be unwieldy; this matches how `PurchaseBill`/
  `PurchaseBillItem` are already passed as structs elsewhere in this codebase.
- **Why:** client-specified fields and picker requirement; required-fields and
  list-column choices were explicit client decisions (not required-by-default the way
  Company's `name` is, since a customer record is realistically built up over time).

### 2026-09-26 — Migration policy clarified: additive is auto-safe, breaking needs care
- **Decision:** Explicitly split the schema-change policy in two, and wrote it down
  (`docs/DATA_MODEL.md`, `CLAUDE.md`) after the client asked how the `customers` table
  (this session) would reach their existing database without losing anything:
  1. **Additive changes** (new table, new column with a `DEFAULT`) are appended to the
     `migrations` slice in `internal/db/migrate.go` as always, and need **no manual step
     for the client at all** — `migrate()` (tracked via `schema_migrations`) applies only
     what's new the next time the app opens the database, production data included, and
     never touches an existing table/row. This was already how the migration runner
     worked; what changed is making the guarantee explicit rather than implicit.
  2. **"Reset/wipe the database"** — previously the blanket instruction for "the schema
     changed" — is now documented as a **local-development-only** convenience, for
     iterating on a migration's shape before it ships, on a machine/table with nothing
     worth keeping. It must never be suggested for the client's database again.
  3. **Breaking changes** (rename/retype/drop an existing column) are called out as
     needing a real, hand-written migration that transforms existing rows (or an explicit
     client conversation about what would be lost) — `CREATE TABLE IF NOT EXISTS` cannot
     rescue data out of a column that's disappearing, so this category cannot be handled
     the same way as #1.
- **Why:** the client now has real, irreplaceable business data (companies, items,
  purchase bills, and going forward customers) — the original "delete the dev DB to reset
  it" guidance in `docs/DATA_MODEL.md`/`CLAUDE.md` was written before any of that existed
  and, read literally today, could be misapplied to the client's production file. Writing
  the distinction down prevents a future session (or a rushed moment in this one) from
  suggesting a wipe as a shortcut for what should be an automatic, zero-risk update.
- **Not a code change** — `internal/db/migrate.go`'s actual behavior is unchanged; this
  is a documentation/process correction to match what the runner already safely does.

### 2026-09-26 — Add Order: global item search, reuse over new components, derived rate history
- **Decision:** First functional piece of the Order Book — a `/orders/new` page mirroring
  Add Purchase Bill, with three deliberate departures the client confirmed:
  1. **Item columns show Pack Size, GST %, *and* HSN** (full item-master visibility),
     even though only Pack Size feeds this order's math (`Rate × Qty × Pack Size`) — GST%/
     HSN are shown for reference, not yet used in any formula.
  2. **No order number for v1** — the internal `sales_orders.id` is the only identifier;
     add a real number later if the client needs one to reference orders with customers.
  3. **Quick-add customer reuses `EditCustomerDialog`** (extended with a create mode)
     rather than a separate lightweight dialog, so a quick-added customer gets the exact
     same full 9-field form as the Customers page, not a stripped-down version.
- **Item search is global (`ListItems()`), not company-scoped** like Add Purchase Bill's
  `ListItemsByCompany` — there's no company on this page's header to scope by, so every
  item in the catalog is eligible for an order line. `ItemCombobox` was extended (not
  replaced) with an opt-in `showCompany` prop so the same component now disambiguates
  same-named items across companies here, while Add Purchase Bill's already-shipped look
  is untouched (prop defaults off).
- **New `CustomerCombobox`** (mirrors `CompanyCombobox`) filters by name, nickname, *or*
  city and shows a composite "Name (Nickname) · City" label — a plain name-only filter
  (like `CompanyCombobox`) wouldn't be enough to tell similarly-named customers apart.
- **Rate history is derived, not a separate table.** The client asked for the Rate field
  to prefill from the latest rate a customer previously paid for an item, plus an info
  button showing the full history. Rather than a table that has to be kept in sync, this
  queries `sales_order_items` JOINed to `sales_orders` for that `(customer_id, item_id)`
  pair — every past order already *is* the history. `RateHistory`/`GetRateHistory` return
  rows ordered by `id` only (a cheap tie-break); the **frontend sorts by parsed date**
  (`AddOrder.tsx`, `RateHistoryDialog.tsx`) since the stored date is free text, not a
  SQL-sortable value — same reasoning as every other date sort in this app. Prefill fires
  once, when an item is picked, using whichever customer is selected at that moment; it
  does not retroactively refresh an already-filled line if the customer changes afterward
  — the described workflow is customer-first, then items, so this covers the real case
  without tracking "was this rate manually edited."
- **`DeleteCustomer` gained a reference guard** (see the Customers-master entry above) —
  `sales_orders.customer_id` is the first real FK into `customers`, so the previously
  "nothing references it yet" unguarded delete would otherwise hit a raw SQLite
  foreign-key-constraint error the moment a customer with orders was deleted.
- **Backend scope is Add-only**, matching "build the Add Order page first": only
  `AddSalesOrder` exists. `sales_orders`/`sales_order_items` are still designed in full now
  so the schema doesn't need reshaping when View/Edit Orders (List/Get/Update/Delete)
  arrives later.
- **Shared calc in a new `lib/salesOrder.ts`** (`calcOrderLine`), mirroring
  `lib/purchaseBill.ts`'s "one formula, reused not re-derived" rule, so View/Edit Orders
  doesn't re-derive Final Amount later.

### 2026-09-26 — Add Order client feedback: lock items to a chosen customer; switch-customer prompt
- **Decision:** Two rounds of manual-testing feedback, applied the same day Add Order
  shipped:
  1. The item picker is now **disabled until a customer is chosen** (placeholder: "Select
     a customer first") — rate-history prefill needs a customer to look up against, so
     picking an item first was never actually useful.
  2. **Changing the header customer after lines already have items** no longer just
     applies silently. It now prompts (`AlertDialog`, same shape as Add Purchase Bill's
     company-switch confirm): **Keep current rates** (apply the new customer, leave every
     line's Rate untouched), **Recalculate rates** (apply the new customer, then re-run
     the rate-history lookup for every filled line and re-prefill Rate from it), or
     **Cancel** (revert the picker to the original customer via the same
     force-remount-via-`key` trick `AddPurchaseBill.tsx` already uses for its company
     combobox). Quick-adding a brand-new customer goes through the same prompt.
- **Why:** client feedback after trying the page — locking item entry avoids a state
  where rate prefill silently can't happen; the switch-customer prompt avoids silently
  leaving stale, wrong-customer rates in place (or silently discarding rates the user may
  have already hand-adjusted) when the customer changes mid-order.

### 2026-09-26 — Item stock: derived from purchases minus sales, not a new table
- **Decision:** Show current on-hand stock per item — total purchased
  (`tax_qty + d_qty` across `purchase_bill_items`) minus total sold (`qty` across
  `sales_order_items`) — on Add Order's line-items table and as a new column on the Items
  master. Computed as a **correlated-subquery addition to the existing `itemSelect`**
  query (`internal/db/items.go`), not a new table or a separate lookup call — every
  existing caller of `ListItems`/`ListItemsByCompany` gets `Item.Stock` for free, so
  Add Order's already-cached item list needs no extra round trip when a line's item is
  picked. Same "derive it, don't store/duplicate it" reasoning as rate history and every
  calculated bill column in this app.
- **No over-sell validation** — Qty greater than Stock is allowed and not flagged; the
  client asked to *see* stock, not to be blocked by it.
- **Add Order re-fetches its cached item list after a successful save**, so Stock stays
  current if the same item is used again later in the same session (e.g. a second order
  right after).
- **`AddItem`/`UpdateItem` leave `Stock` at its zero value** in their returned struct —
  the same existing pattern already used for `CompanyName` there ("callers re-list to
  refresh"); a brand-new item has no history yet regardless.

### 2026-09-27 — View/Edit Orders: mirror View/Edit Bills exactly, extend AddOrder in place
- **Decision:** The last deferred piece of the Order Book — client asked for "similar
  conventions as View/Edit Bills." Built `SavedOrders.tsx` as a near-verbatim structural
  copy of `SavedBills.tsx` (list/search/date-range-filter/sort → read-only detail →
  Edit/Delete), and gave `AddOrder.tsx` an edit mode the same way `AddPurchaseBill.tsx`
  already serves both add and edit from one component — not a new/separate editor file.
  Backend gained `ListSalesOrders`/`GetSalesOrder`/`UpdateSalesOrder`/`DeleteSalesOrder`,
  each a direct structural mirror of `purchase_bills.go`'s equivalent.
- **Customer prefill in edit mode uses a freshly-fetched full customer list, not a
  partial reconstruction** — `AddPurchaseBill.tsx` gets away with
  `{id, name} as db.Company` for its Company prefill because `Company` genuinely only has
  those two fields; `Customer` has nine, and `CustomerCombobox` dereferences `.nickName`/
  `.city` directly in its filter/label logic, so a partial cast there would throw the
  first time the combobox rendered. Caught this before it shipped by tracing exactly what
  `CustomerCombobox` touches, not just following the Purchase Bill pattern blindly.
- **Rate history is fetched but rates are not re-prefilled when loading for edit** — the
  info button should work immediately on an existing order, but editing an order should
  show what was actually charged, not silently overwrite it with today's latest rate the
  way a *new* line's selection does.
- **No Stock column on the order detail view** — Stock is a live figure meant to help
  decide how much to order *now*; it's not a fact about an order already placed, so it
  doesn't belong on a historical record the way Pack Size/GST %/HSN/Rate/Qty do.
- **No order-number column on the list** (matches the earlier "no order number for v1"
  decision) — Customer/Date/Qty/Final Amount only.
- **Nothing extra needed for Stock/rate-history correctness after an edit or delete** —
  both are computed live from `sales_order_items` at read time, so changing or removing an
  order is automatically reflected everywhere else that reads them.
- **Nav icon `ClipboardList`** for View/Edit Orders — deliberately distinct from Add
  Order's `ShoppingCart` and View/Edit Bills' `FileText`, so the nav bar doesn't show two
  identical icons for two different things.

### 2026-09-27 — Post-ship v0.6.0 patch: five small client-reported fixes
- **`ItemCombobox` keyed dropdown rows by `name · packSize` instead of `item.id`.** Client
  renamed a Prayagh item to match Sapna's naming and two different items (different
  companies) ended up with an identical name+pack-size; React's reconciliation broke on
  the duplicate key and left a phantom duplicate row in the Add Order item search. Keying
  by `id` (the actual unique identity) fixes it regardless of what two items are named.
  **Lesson: never key a list by a field that isn't guaranteed unique, even if it "usually"
  is** — this bites only when data collides, which the master's own unique constraint
  didn't protect against here (constraint is per-company; nothing stops two *different*
  companies from having identically-named items).
- **Purchase Summary Excel export:** quantity columns (Pack Size, Tax Qty, D Qty,
  including their Totals-row cells) now format as `0` (whole numbers, no decimals) instead
  of `0.00` — matches the app's own `fmtQty` convention (quantities are always whole in
  this business) and was purely a leftover inconsistency in the report styling, not a data
  issue. **GST % is now a real Excel Percentage cell** — written as the fraction
  (`gstPercent / 100`) with format `0%`, not the raw number with `0.00`; previously it
  displayed as a plain number ("5.00") with no `%` and 2 decimals it never needed (GST
  slabs are whole percentages in this business's real data).
- **Add Order's `ItemCombobox` widened (`w-56` → `w-72` via a new `className` override
  prop) and its dropdown row goes two-line when `showCompany` is set:** name + pack size
  together on line 1 (name truncates only if it still doesn't fit), company name alone on
  line 2. Plain truncating everything onto one line (tried first) hid the item name behind
  an ellipsis too eagerly; two lines gives the name room while still keeping the company
  legible instead of squeezed off to the side.
- **`StateCombobox` didn't save manually-typed text at all** — `onChange` only updated the
  input's own local `query` state; the parent's `state` field (and therefore
  `AddCustomer`/`UpdateCustomer`) only ever heard about a value via `onSelect`, which fired
  solely on clicking a dropdown suggestion. Typing a state and never picking a suggestion
  meant nothing was ever passed up, so nothing saved. Fixed by calling `onSelect` on every
  keystroke too — safe here specifically because State is a plain string column, not an FK
  like Company/Item, so free text is a perfectly valid value, unlike those comboboxes.
- **`TopNav` header used a fixed `h-14`** while its `nav` wraps (`flex flex-wrap`) once the
  window is too narrow for all links on one line. On wrap, the two-row nav grew taller
  than the header's fixed box, so the wrapped row spilled past the header's own
  bottom edge with no breathing room before the border. Changed to `min-h-14 flex-wrap` +
  `py-2` so the header grows to fit however many rows the nav wraps to, with equal padding
  top and bottom — single-line (normal window width) layout is unchanged since `min-h-14`
  still equals the old fixed height there.
- All five verified: DB queried directly for the item-key bug (confirmed the DB itself had
  no duplicate rows — 3 genuinely distinct items, purely a frontend rendering bug); the
  Excel fixes verified by generating a real workbook and inspecting `styles.xml`/the sheet
  XML directly (confirmed `0`/`0%` number formats and the `0.05`-style fraction value)
  rather than eyeballing a screenshot. `go build/vet/test` ✅, `npm run build` ✅.

### 2026-09-27 — Order delivered status: reversible toggle, excluded from `UpdateSalesOrder`
- **Decision:** New `sales_orders.delivered` column (migration id 8, `INTEGER NOT NULL
  DEFAULT 0`), written only through a new targeted `SetSalesOrderDelivered(id, delivered)`
  (single-column `UPDATE`, returns the refreshed row) — never through `UpdateSalesOrder`,
  whose SET clause deliberately stays `customer_id = ?, date = ?` only. Delivery status is
  a **reversible toggle** (client confirmed), not a one-way mark: the same button flips
  either direction, both in the `/orders` list row and on the order's edit page.
- **Why:** `AddOrder.tsx`'s Save flow builds its order payload as a plain object cast
  `as db.SalesOrder` that never sets `delivered` — if `UpdateSalesOrder` included that
  column in its SET clause, any content-only edit-and-save (e.g. just changing the Date)
  would silently reset delivered back to `false`, since the frontend has no reason to
  round-trip a field it isn't editing. Excluding the column from that statement entirely
  makes the reset structurally impossible rather than relying on frontend discipline. A
  reversible single control (vs. two conditional one-way actions) was simpler to reason
  about and matches how a status flip is conceptually one thing, not two.
- **Alternatives:** Route the delivered flag through `UpdateSalesOrder` and have the
  frontend always include the current value in its save payload — rejected: an extra
  footgun for every future edit-flow change, for no benefit over a dedicated endpoint that
  already existed as a clean pattern (`SetSalesOrderDelivered` mirrors how status-only
  writes are kept separate from whole-row overwrites elsewhere in this codebase). One-way
  "mark delivered" only (no undo) — rejected per client's explicit ask for reversibility.
- This is the first boolean column in the schema (`modernc.org/sqlite` maps Go `bool` ↔
  `INTEGER` transparently, no manual conversion needed) and the first use of shadcn
  `Switch`/`Badge` components in this codebase — both added via
  `npx shadcn@latest add switch badge`, then had their generated `cn` import corrected
  from the CLI's newer `"cn"` package convention to this project's existing
  `@/lib/utils` import (kept the extra `cn` npm dependency out of `package.json`, matching
  every other `ui/` component here).

### 2026-09-27 — Bug: leaving an edit form via nav left stale data on the "new" form
- **Found while testing** the delivered-status feature above: edit an order, click "Add
  Order" in the top nav, confirm "Discard changes" — the resulting `/orders/new` page
  showed the *edited order's* data (customer, date, lines) instead of a blank form.
- **Root cause:** `/orders/new` and `/orders/:id/edit` render the same `<AddOrder/>`
  element at the same position in the route tree, so React Router reuses the existing
  component instance across that navigation rather than remounting it — only the `id`
  URL param (and therefore `editId`) changes. The edit-mode prefill effect only ever
  writes to form state `if (editId != null)`; there was no corresponding branch to clear
  it back to blank when `editId` becomes `null` again, so whatever the edit form last held
  just stayed in state, and the now-unmatched edit-mode effect had nothing to overwrite it
  with. Same shape of bug confirmed in `AddPurchaseBill.tsx` (`/purchase-bills/new` +
  `/purchase-bills/:id/edit` sharing one component the same way) and fixed there too.
- **Fix:** added a second effect, `if (editId != null) return;` else reset every
  form-owned field (header + lines + counters) to its blank-form initial value, keyed on
  `[editId]` — mirrors the existing edit-mode effect's shape but for the opposite branch.
  Runs harmlessly on the normal "new" mount too (state's already blank there).
- **Alternatives:** key the `<Route>` element on `id ?? 'new'` to force a full remount
  instead — rejected: correct, but throws away the cheap in-place reset for a full
  unmount/remount that re-runs the customers/items/companies cache-fetch effect
  unnecessarily on every add↔edit transition, for no behavioral benefit over an explicit
  reset.

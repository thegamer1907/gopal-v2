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
- **Still open:** company edit/delete; more company columns (GSTIN, address, …).

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

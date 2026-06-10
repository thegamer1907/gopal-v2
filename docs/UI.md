# UI / UX

Screens, flows, and visual decisions, recorded as they firm up.

## Stack & conventions
- **shadcn/ui** (new-york style, **neutral** base color) on **Tailwind CSS v4**.
  Theme is **light only** (see `DECISIONS.md`).
- Components are copied into `src/components/ui/` and are **owned/editable** — not a
  runtime library. Add more with `npx shadcn@latest add <name>` (config in
  `frontend/components.json`).
- **Path alias:** `@/` → `frontend/src/` (set in `vite.config.ts` + `tsconfig.json`).
- **Theme tokens** live in `frontend/src/index.css` (`:root` variables + `@theme inline`
  mapping). Change look/feel there. A `.dark` block can be added later if we revisit the
  light-only decision.
- **Font:** Nunito (bundled at `src/assets/fonts/`, loaded via `@font-face` in `index.css`).
- **Utility:** `cn()` in `src/lib/utils.ts` merges class names (used by all components).
- **Numeric fields:** use `NumberInput` (`src/components/NumberInput.tsx`) instead of
  `<Input type="number">` — a plain text box (no up/down spinner) that accepts digits and a
  single decimal point only (`inputMode="decimal"`). It takes `value: string` /
  `onChange: (v) => void`.
- Icons: **lucide-react**.
- **Data-entry pages follow a required pattern** (see `DECISIONS.md`, 2026-06-09): disable the
  submit button until `isValid` (all required fields filled — `0` counts as filled), and wire
  the unsaved-changes guard (`setDirty(isDirty)` via effect + clear on unmount) so navigating
  away warns first. Applies to Add Purchase Bill, Items, Companies, and every future form.
- The **frontend-design** plugin/skill is installed — use it when building the real
  screens for a distinctive, polished look beyond the shadcn defaults.

---

## App shell & navigation
- **Layout** (`src/App.tsx`): a **persistent, collapsible left sidebar**
  (`src/components/AppSidebar.tsx`) beside the routed content, via shadcn's `sidebar`
  primitive — `SidebarProvider` (pinned to `h-svh`) › `AppSidebar` + `SidebarInset`. **There
  is no top bar** — the inset is just a **full-width**, padded content area (`flex-1
  overflow-auto px-6 py-8`) that fills the window and scrolls internally. No max-width cap,
  so wide screens (e.g. the bill line-items grid) use the whole window. Each page lives in
  `src/pages/`.
- **Sidebar** (`collapsible="icon"`): the header is a **hamburger toggle (top-left) + the
  GopalOne wordmark** — the hamburger **is** the collapse control (a ghost `Button` calling
  `useSidebar().toggleSidebar()`; no separate trigger element). Then **grouped** `NavLink`
  menu items — *(ungrouped)* Dashboard · **Purchases**: Add Purchase Bill / Saved Bills ·
  **Masters**: Items / Companies — and a **`SidebarFooter`** pinned at the bottom with
  **Settings** (gear). Collapsing hides labels + the wordmark, leaving a thin **icon-only
  rail** (the hamburger stays, to expand again; menu tooltips show labels on hover) to
  reclaim width for wide grids. The active route is highlighted (`SidebarMenuButton
  isActive`, exact-path match so sibling routes like `/purchase-bills` and
  `/purchase-bills/new` don't both light up).
- **Routing:** `react-router-dom` + `HashRouter` (see `DECISIONS.md`). To add a page:
  create it in `src/pages/`, add a `<Route>` in `App.tsx`, add an entry to a group in
  `AppSidebar.tsx`.
- **Unsaved-changes guard:** an `UnsavedChangesProvider` (`src/components/UnsavedChanges.tsx`)
  exposes `{dirty, setDirty}`. A page that holds unsaved edits calls `setDirty(true)` (clearing
  it on save/reset/unmount). `AppSidebar` intercepts menu clicks while `dirty` and shows an
  `alert-dialog` — **"Stay and save"** (cancel) vs **"Switch anyway"** (discards and navigates).
  Add Purchase Bill is the first consumer.

## Screens
### Dashboard (`/`) — placeholder
- Landing page. Currently a single centered "Hare Krishna". Real content (KPIs / recent
  activity) to be defined.

### Add Purchase Bill (`/purchase-bills/new`) — sidebar "Add Purchase Bill"
- **Header card** — Company name, Bill number, Date. **Company** is a `CompanyCombobox`
  (mirrors the item search): type to filter the cached company master; pick one, or **"Add
  '…' as new company"** opens `NewCompanyDialog` → `AddCompany` → pushed into the cache and
  selected. The selected value is the full company (id + name); the bill is saved with its
  `company_id`. Save stays disabled until a company is chosen. Date is a text field in **dd/mm/yyyy**
  (defaults to today) and is stored as entered. It has **both** a free-typed text box and a
  **calendar popover** (shadcn `calendar` + `popover`, react-day-picker) behind a calendar
  icon; both drive one `date` string — picking a day writes `dd/mm/yyyy`, and the calendar
  opens on the currently-typed date when it parses (`parseDDMMYYYY` / `fmtDDMMYYYY` helpers).
- **Line items** — a wide, horizontally-scrollable grid. Each line:
  - **Item search** (`ItemCombobox`): all items are cached once on load (`ListItems`); typing
    filters and shows suggestions as “name · pack size”. Selecting one fills the line and
    pulls its Pack Size / GST % (shown read-only, used in formulas). The suggestion list is
    **rendered in a portal** (fixed-positioned under the input) so the horizontally-scrolling
    grid doesn't clip it or gain a stray vertical scrollbar.
  - **Column order** (left→right): Item · Pack Size · GST % · **Tax Qty · Tax Value · D Qty ·
    D Value** (inputs) · **GST Amount · Tax Bill Amount · Bill Value · Billing Rate · Final
    Rate** (calculated, shaded band) · **Discount · Remarks** (inputs) · delete.
  - Headers are **center-aligned and wrap** (`leading-tight`, no `whitespace-nowrap`);
    qty columns are narrow (`w-14`) since values are short. Inputs use `NumberInput`.
  - **Calculated (read-only, muted) columns**, recomputed live (display names → formula):
    GST Amount = TaxValue×GST%/100 · Tax Bill Amount = TaxValue+GST Amount ·
    Bill Value = Tax Bill Amount + D-Value ·
    Billing Rate = TaxValue/TaxQty · Final Rate = BillValue/(TaxQty+D-Qty)×PackSize.
  - **Add row** / per-row delete. A **table footer "Totals" row** shows running sums under
    **Tax Bill Amount** and **Bill Value** (replaces the old single Bill total).
- **Add new item on the fly** (`NewItemDialog`): if a search has no match, “Add … as new
  item” opens a dialog (Item / Pack Size / GST % / HSN) → `AddItem` → pushed into the cache
  and selected for the line.
- **Save** persists the whole bill via `AddPurchaseBill` (header + lines, one transaction);
  shows a confirmation and resets the form. The button is **disabled until the form is
  valid**: header (Company, Bill number, a real dd/mm/yyyy date) filled, **at least one
  complete line**, and **no partially-filled line** left over. Mandatory line fields are the
  item + the four numeric inputs (Tax Qty, Tax Value, D Qty, D Value); **Discount and Remarks
  are optional**.
- Built with shadcn `Card`, `Input`, `Label`, `Button`, `Dialog` + lucide icons; the line
  grid is a plain scrollable `<table>` (many columns).

### Saved Bills (`/purchase-bills`) — sidebar "Saved Bills"
- **List → detail**, single page (`src/pages/SavedBills.tsx`). Loads all bills via
  `ListPurchaseBills` plus the item master via `ListItems` (for GST% lookup) on mount.
- **List:** a card with a table of bills — **Bill number · Company · Date · Items (count) ·
  Bill value (total)**. Rows are clickable (hover highlight); empty state when none saved.
- **Detail:** clicking a row swaps in a read-only view — a **"Back to all bills"** button, a
  header card (Bill number / Company · Date), and the **same line-items grid as Add Purchase
  Bill** but display-only (no inputs/delete), with the footer **Totals** row.
- **Calculated columns** (GST Amount, Tax Bill Amount, Bill Value, Billing Rate, Final Rate)
  are **not stored** — they're recomputed from the saved raw fields via the shared
  `calcLine` helper in **`src/lib/purchaseBill.ts`** (same module the Add screen uses, so the
  formula lives in one place). **GST%** isn't stored on the line; it's looked up from the
  **current** item master by `(name, pack size)` — i.e. the *live* rate, not an as-billed
  snapshot (see `DECISIONS.md`; defaults to 0 if the item is no longer in the master).

### Items (`/items`) — item master
- A live item count, an "Add item" card (**Item, Pack Size, GST %, HSN** + Add), and a card
  with a table of items (Item / Pack Size / GST % / HSN) with an empty state. Pack Size / GST %
  / HSN use `NumberInput` (no spinner); same in the on-the-fly `NewItemDialog`.
- Built with shadcn `Card`, `Input`, `Label`, `Button`, `Table`. Add-only for now;
  edit/delete to follow.

### Companies (`/companies`) — company master
- Mirrors the Items page: a live company count, an "Add company" card (just **Company name**
  + Add for now — more columns later), and a card with a table of companies (with an empty
  state). Built with the same shadcn `Card`/`Input`/`Label`/`Button`/`Table`. Add-only for now.
- Companies are also pickable/creatable inline on the bill header via `CompanyCombobox` +
  `NewCompanyDialog` (see Add Purchase Bill).

### Settings (`/settings`) — sidebar footer "Settings"
- `src/pages/Settings.tsx`. First (and only) section is **Database**:
  - **Current location** — `GetDatabasePath()` shown in a monospace box (dir muted, filename
    emphasized).
  - **Open existing database…** (`OpenExistingDatabase`) and **Create new database…**
    (`CreateNewDatabase`) — native Wails file dialogs (filter `*.db`). On a successful, non-
    cancelled choice the app **reloads** (`window.location.reload()`) so every page re-fetches
    against the new DB. Cancel = no-op.
  - **Danger zone — Wipe database** — destructive `Button` opens a **controlled** `AlertDialog`
    (not a Radix `asChild` trigger — see the React-18 ref note in `DECISIONS.md`); confirming
    calls `WipeDatabase()` then reloads.
  - A `busy` flag disables the buttons during a call; errors render in `text-destructive`.

## Open decisions
_None blocking._

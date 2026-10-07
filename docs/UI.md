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
- **Dates** display/enter as **dd-mmm-yy** (month in words, 2-digit year) via the shared **`@/lib/date`**
  (`formatDate` / `todayDate` / `parseDate`) — use it everywhere a date is shown or typed.
- **Numbers** render Indian-style (lakh/crore grouping) via **`@/lib/purchaseBill`**: **`fmt`**
  for monetary amounts (always 2 decimals, e.g. `1,20,300.00`) and **`fmtQty`** for quantities
  (whole numbers, e.g. `1,250`). Both `Intl.NumberFormat('en-IN', …)` + NaN-guarded. Use them
  everywhere a value is shown; never `toFixed`/`toLocaleString` ad hoc. Raw catalog numerics
  (Pack Size, GST %, HSN) stay unformatted.
- **List tables are sortable + filterable.** Reusable bits: **`useTableSort`** (`@/hooks`) takes
  the rows + a `{key: accessor}` map (accessor returns string/number/Date) and returns
  `{sorted, sortKey, sortDir, toggle}`; **`SortableHeader`** (`@/components`) renders a clickable
  `TableHead` with the direction chevron. Pair with a `useMemo` search filter (Search-icon
  `Input`) feeding the rows into `useTableSort`. Tables with a **date** column also get a
  **`DateRangeFilter`** (`@/components`, Popover + range `Calendar`) — feed its `{from,to}` into
  the same filter `useMemo`.
- **Input borders** are deliberately darker than card/table borders: the `--input` token
  (`index.css`) is a heavier gray than `--border` so entry boxes read clearly on bright screens.
- **Data-entry pages follow a required pattern** (see `DECISIONS.md`, 2026-06-09): disable the
  submit button until `isValid` (all required fields filled — `0` counts as filled), and wire
  the unsaved-changes guard (`setDirty(isDirty)` via effect + clear on unmount) so navigating
  away warns first. Applies to Add Purchase Bill, Items, Companies, and every future form.
- The **frontend-design** plugin/skill is installed — use it when building the real
  screens for a distinctive, polished look beyond the shadcn defaults.

---

## App shell & navigation
- **Window:** launches **maximised** (`WindowStartState: options.Maximised` in `main.go`) —
  fills the screen but keeps the OS title bar.
- **Layout** (`src/App.tsx`): a **flat, always-visible top navigation bar**
  (`src/components/TopNav.tsx`) above the routed content — an outer `div.flex.h-svh.flex-col`
  › `TopNav` + `<main className="flex-1 overflow-auto px-6 py-8">`. The `<main>` is the
  **full-width** padded content area that fills the window and scrolls **vertically**. No
  max-width cap, so wide screens (e.g. the bill line-items grid) use the whole window — and
  there's no sidebar eating width. Each page lives in `src/pages/`. (Replaced the old
  collapsible left sidebar — see `DECISIONS.md` 2026-06-15.)
- **Top bar** (`h-14`, `border-b`): left side is the **GopalOne wordmark** + the primary
  `NavLink`s in one row — Dashboard · Add Purchase Bill · View/Edit Bills · Add Order ·
  View/Edit Orders · Items · Companies · Customers · Reports;
  right side (`ml-auto`) is **Settings** (gear) and **Logout** (closes the app via `Quit()`
  after a "Close GopalOne?" confirm `AlertDialog`). Links are styled with
  `buttonVariants({variant:'ghost', size:'sm'})`; the **active route** gets a filled
  `bg-muted`/`font-medium` look via an exact-path `isActive` (so sibling routes like
  `/purchase-bills` and `/purchase-bills/new` don't both light up). Everything is always
  visible — nothing to collapse or open.
- **Routing:** `react-router-dom` + `HashRouter` (see `DECISIONS.md`). To add a page:
  create it in `src/pages/`, add a `<Route>` in `App.tsx`, add an entry to the `links` array
  in `TopNav.tsx`.
- **Unsaved-changes guard:** an `UnsavedChangesProvider` (`src/components/UnsavedChanges.tsx`)
  exposes `{dirty, setDirty}`. A page that holds unsaved edits calls `setDirty(true)` (clearing
  it on save/reset/unmount). `TopNav` intercepts nav-link clicks while `dirty` and shows an
  `alert-dialog` titled **"Save your changes before leaving?"** with a **top-right ✕** (closes =
  keep editing) and two buttons: **"Discard changes"** (outline; discards and navigates) and
  **"Continue editing"** (primary/default, auto-focused; just closes). Add Purchase Bill is the
  first consumer.

## Screens
### Dashboard (`/`) — placeholder
- Landing page. Currently a single centered "Hare Krishna". Real content (KPIs / recent
  activity) to be defined.

### Add Purchase Bill (`/purchase-bills/new`) — top-nav "Add Purchase Bill"
- **Header card** — Company name, Bill number, Date. **Company** is a `CompanyCombobox`
  (mirrors the item search): type to filter the cached company master; pick one, or **"Add
  '…' as new company"** opens `NewCompanyDialog` → `AddCompany` → pushed into the cache and
  selected. The selected value is the full company (id + name); the bill is saved with its
  `company_id`. Save stays disabled until a company is chosen. Date is a text field in
  **dd-mmm-yy** (month in words, 2-digit year, e.g. `09-Jun-26`; defaults to today) and is
  stored as entered. It has **both** a free-typed text box and a **calendar popover** (shadcn
  `calendar` + `popover`, react-day-picker) behind a calendar icon; both drive one `date`
  string — picking a day writes `dd-mmm-yy`, and the calendar opens on the currently-typed
  date when it parses (the calendar popup's own month/year heading is react-day-picker's own,
  independent of this format — full month name + 4-digit year, unchanged). Format/parse via
  the shared **`@/lib/date`** (`formatDate` / `todayDate` / `parseDate` / `displayDate`) —
  `parseDate` also still accepts the legacy 4-digit-year form so bills saved before the
  2026-09 switch keep working; `displayDate` normalizes any stored string to the current
  form for display, so old bills show `dd-mmm-yy` on screen too without any data migration.
- **Line items** — a wide, horizontally-scrollable grid. Each line:
  - **Item search** (`ItemCombobox`): items are **company-scoped** — fetched via
    `ListItemsByCompany(company.id)` whenever the header company changes, not a global
    cache (corrected 2026-09-26; this previously said "all items cached via `ListItems`",
    which was never accurate for this page). Typing filters and shows suggestions as
    "name · pack size". Selecting one fills the line and pulls its Pack Size / GST % (shown
    read-only, used in formulas). The suggestion list is **rendered in a portal**
    (fixed-positioned under the input) so the horizontally-scrolling grid doesn't clip it
    or gain a stray vertical scrollbar. A `showCompany` prop (off by default, so this
    page's look is unchanged) additionally shows the item's company in the dropdown row —
    added for Add Order, whose item search *is* global across every company.
  - **Column order** (left→right): Item · Pack Size · GST % · **Tax Qty · Tax Value · D Qty ·
    D Value** (inputs) · **GST Amount · Tax Bill Amount · Bill Value · Billing Rate · Final
    Rate** (calculated, shaded band) · **Discount · Remarks** (inputs) · delete.
  - Headers are **center-aligned and wrap** (`leading-tight`, no `whitespace-nowrap`);
    qty columns are narrow (`w-14`) since values are short. Inputs use `NumberInput`.
  - **Calculated (read-only, muted) columns**, recomputed live (display names → formula):
    GST Amount = TaxValue×GST%/100 · Tax Bill Amount = TaxValue+GST Amount ·
    Bill Value = Tax Bill Amount + D-Value ·
    Billing Rate = TaxValue/TaxQty · Final Rate = (BillValue/(TaxQty+D-Qty))/PackSize.
  - **Add row** / per-row delete. A **table footer "Totals" row** shows running sums for
    **every column except** Pack Size, GST %, Billing Rate, Final Rate and Remarks — i.e. Tax
    Qty, Tax Value, D Qty, D Value, GST Amount, Tax Bill Amount, Bill Value, and Discount.
- **Add new item on the fly** (`NewItemDialog`): if a search has no match, “Add … as new
  item” opens a dialog (Item / Pack Size / GST % / HSN) → `AddItem` → pushed into the cache
  and selected for the line.
- **Save** persists the whole bill via `AddPurchaseBill` (header + lines, one transaction);
  shows a confirmation and resets the form. The button is **disabled until the form is
  valid**: header (Company, Bill number, a real dd-mmm-yy date) filled, **at least one
  complete line**, and **no partially-filled line** left over. The **Save button is centered**
  at the bottom of the page. Mandatory line fields are the
  item + the four numeric inputs (Tax Qty, Tax Value, D Qty, D Value); **Discount and Remarks
  are optional**.
- Built with shadcn `Card`, `Input`, `Label`, `Button`, `Dialog` + lucide icons; the line
  grid is a plain scrollable `<table>` (many columns).
- **Doubles as the bill editor:** the same component also serves `/purchase-bills/:id/edit`
  (route param via `useParams`). In edit mode it prefills the header + lines from
  `GetPurchaseBill`, shows an "Edit purchase bill" heading + an **Update bill** button, and on
  save does a **complete overwrite** via `UpdatePurchaseBill` then returns to View/Edit Bills.

### View/Edit Bills (`/purchase-bills`) — top-nav "View/Edit Bills"
- **List → detail**, single page (`src/pages/SavedBills.tsx`). Loads all bills via
  `ListPurchaseBills` on mount (`refresh()` is reused after a delete).
- **List:** a card with a table of bills — columns **Company · Date · Bill number · Qty · Amount**,
  where **Qty** = Σ(taxQty + dQty) over the bill's lines (`fmtQty`) and **Amount** = total Bill
  Value (`fmt`). **Default sort: Date, newest first**; every column header is a `SortableHeader`.
  Above the table: a **search box** (filters by company **or** bill number) and a **`DateRangeFilter`**
  (keeps bills whose date falls in the chosen inclusive window; `to` is treated as end-of-day).
  Rows are clickable (hover highlight); empty state when none saved, and a "no match" state when
  filters exclude everything.
- **Detail:** clicking a row swaps in a read-only view — a **"Back to all bills"** button plus
  **Edit bill** and **Delete** actions, a header card (Bill number / Company · Date), and the
  **same line-items grid as Add Purchase Bill** but display-only, with the footer **Totals** row.
  - **Edit bill** → navigates to `/purchase-bills/:id/edit` (the same bill form in edit mode).
  - **Delete** → a controlled `AlertDialog` confirm → `DeletePurchaseBill` → back to the list
    (refreshed). Line items are removed by the DB cascade.
- **Calculated columns** (GST Amount, Tax Bill Amount, Bill Value, Billing Rate, Final Rate)
  are **not stored** — recomputed from the saved raw fields via the shared `calcLine` helper in
  **`src/lib/purchaseBill.ts`**. Item **name/pack/GST** come from the backend's JOIN on the
  line's `item_id` (current master value), so no separate lookup is needed.

### Add Order (`/orders/new`) — top-nav "Add Order" (first piece of the Order Book / Sales feature)
- `src/pages/AddOrder.tsx`. Closely mirrors Add Purchase Bill, adapted for a Customer
  header instead of a Company: **Order details** card (Customer, Date) + **Line items**
  card, Save centered below both, same unsaved-changes guard. No order number (just the
  internal id) — that field doesn't exist for orders.
- **Also serves as the order editor**, exactly like `AddPurchaseBill.tsx` doubles as the
  bill editor: the same component handles `/orders/:id/edit` (route param via
  `useParams`). Edit mode prefills header + lines from `GetSalesOrder`, shows an "Edit
  order" heading + "Update order" button, and saves via a **complete overwrite**
  (`UpdateSalesOrder`) before returning to View/Edit Orders — unless the order is delivered,
  in which case it saves through the narrow `UpdateDeliveredSalesOrder` instead (see the
  delivered-order section below). The customer is resolved from
  a freshly-fetched full customer list (not a partial reconstruction the way Add Purchase
  Bill does for Company) since `CustomerCombobox` dereferences fields — nickname, city —
  that a partial object wouldn't have. Each existing line's rate history is fetched (info
  button works immediately) but its **Rate is left exactly as saved**, not re-prefilled
  with today's latest.
- **Customer** (`CustomerCombobox`): types filter the cached customer list by **name,
  nickname, or city**; the dropdown/seeded-input label reads "Name (Nickname) · City" so
  similarly-named customers are easy to tell apart. **"Add … as new customer"** opens
  `EditCustomerDialog` in its create mode (see Customers, below) — only Name and City are
  required, the rest can be filled in later. **Date** is the same free-typed +
  calendar-popover `dd-mmm-yy` field as Add Purchase Bill.
- **Line items** — unlike Add Purchase Bill, item search is **global** (`ListItems()`),
  not scoped to anything (a sales order has no "company" the way a purchase bill does),
  but the item picker is **disabled until a customer is chosen** (placeholder reads
  "Select a customer first") — rate history (below) needs a customer to look up against.
  `ItemCombobox` is reused as-is with a new `showCompany` flag turned on, so its dropdown
  shows the item's company alongside pack size (needed now that the same item name can
  exist under different companies). **Column order**: Item · Pack Size · GST % · HSN ·
  **Stock** (all read-only, from the selected item) · **Rate · Qty** (inputs) ·
  **Final Amount** (calculated, shaded band) · info button · delete.
- **Delivered orders are locked down** (edit mode only). The heading gains a
  **`Delivered #N`** badge and, in place of the Mark-delivered button, the line
  "Delivered — only Qty and Rate can be changed." Customer, Date, the item picker and Pack
  Size all render `disabled`; the per-row delete button and the "Add row" button disappear
  entirely. **Qty and Rate stay editable**, and "Update order" saves them through
  `UpdateDeliveredSalesOrder`, which re-validates everything else server-side.
- **"Mark delivered"** sits beside the "Edit order" heading on an undelivered order and
  opens the shared `MarkDeliveredDialog` confirm (same wording as the `/orders` list). It's
  a direct write that bypasses the form's Save flow and the unsaved-changes guard: on
  confirm the badge, the lockdown and a "Order marked delivered as #N." message all appear
  in place without navigating away. There is no un-mark — delivery is one-way.
- **Stock**: current on-hand quantity for the selected item — total purchased minus total
  sold, **derived** (not stored; see `docs/DATA_MODEL.md`'s `items.stock` note), already
  present on every cached item so it needs no extra fetch. The cached item list is
  re-fetched after a successful save so Stock stays current for the rest of the session
  (e.g. adding the same item to a second order right after). No validation blocks
  entering a Qty larger than Stock — it's shown for reference only.
- **Rate prefill + history**: selecting an item looks up the chosen customer's past rate
  for it (`GetRateHistory`) and prefills **Rate** with the latest one (blank if there's no
  prior order for that pair). The **info** button opens `RateHistoryDialog`, listing every
  past rate for that customer+item, newest first (or an empty state). This lookup is
  **derived from past orders**, not a separate table — see `docs/DATA_MODEL.md`. Prefill
  fires once, at the moment the item is picked.
- **Changing the customer after lines already have items** prompts (controlled
  `AlertDialog`): **Cancel** (reverts the picker to the original customer), **Keep
  current rates** (applies the new customer, leaves every line's Rate untouched), or
  **Recalculate rates** (applies the new customer, then re-runs the rate-history lookup
  for every filled line and re-prefills Rate from it). Quick-adding a brand-new customer
  goes through the same prompt.
- **Final Amount** = Rate × Qty × Pack Size (`calcOrderLine`, `src/lib/salesOrder.ts` —
  mirrors `calcLine`'s "one shared formula" convention). **Totals row** sums only Qty and
  Final Amount, per the client's ask.
- **Add new item on the fly** (`NewItemDialog`, reused as-is): since there's no header
  company to default to, `defaultCompany` is `null` — the user must pick one for a
  brand-new item, same dialog Add Purchase Bill uses.

### View/Edit Orders (`/orders`) — top-nav "View/Edit Orders" (third piece of the Order Book)
- `src/pages/SavedOrders.tsx`. A near-verbatim structural copy of `SavedBills.tsx`:
  **list → detail**, single page. Loads all orders via `ListSalesOrders` on mount
  (`refresh()` reused after a delete).
- **List**: a card with a table of orders — columns **Customer · Date · Qty · Final
  Amount**. **Default sort: Date, newest first**; every column header is a
  `SortableHeader`. Above the table: a **search box** (customer name only), a **"Delivered
  only" `Switch`**, and a **`DateRangeFilter`** (same inclusive/end-of-day behavior as
  View/Edit Bills).
  - The **"Delivered only" toggle is exclusive**: off (the default) shows only undelivered
    orders, on shows only delivered ones. Because every visible row therefore has the same
    status, there's no Status column — instead the two modes differ:
    - **off (pending)**: each row ends with an inline **mark-delivered icon button**.
    - **on (delivered)**: a leading sortable **Delivery #** column, and no action button
      (there's nothing left to do to a delivered order from the list).
  - **Marking delivered is one-way and confirmed**: the icon button opens a
    `MarkDeliveredDialog` (shared with the edit page) spelling out that the order gets the
    next delivery number and can't be moved back to pending. On confirm the list refreshes
    and the order moves to the other side of the toggle.
- **Detail**: clicking a row swaps in a read-only view — "Back to all orders" plus **Copy
  Order Image**, **Download Excel**, **Download PDF**, **Edit order** and **Delete**
  actions, a header card ("Order #{id}" + a **`Delivered #N`** or **`Pending`** badge /
  "{customerName} · {date}"), and a display-only line-items grid (Item · Qty · Pack Size ·
  GST % · HSN · Rate · Final Amount, footer Totals row for Qty and Final Amount). **No
  Stock column here** — Stock is a live decision-support figure for placing a *new* order,
  not a fact about a saved one. Every action stays available on a delivered order,
  including Delete; the exports are identical either way (**no delivery number in the
  customer-facing image/Excel/PDF** — it's an in-app identifier).
  - **Edit order** → navigates to `/orders/:id/edit` (the same `AddOrder.tsx` form in
    edit mode).
  - **Delete** → a controlled `AlertDialog` confirm → `DeleteSalesOrder` → back to the
    list (refreshed). Line items are removed by the DB cascade. Because Stock and rate
    history are both derived live from `sales_order_items`, deleting (or later editing)
    an order is automatically reflected everywhere else that reads them — nothing to
    invalidate or resync.

### Items (`/items`) — item master
- A live item count, a company-scoped "Add item" card (**Company, Item, Pack Size, GST %, HSN** +
  Add), and a card with the items table (Company / Item / Pack Size / GST % / HSN /
  **Stock** + **Actions**). Pack Size / GST % / HSN use `NumberInput` (no spinner); same
  in the on-the-fly `NewItemDialog`.
- **Stock** is current on-hand quantity — total purchased minus total sold, **derived**
  on every read (not a stored column; see `docs/DATA_MODEL.md`), sortable like every
  other column.
- **Search box** (item or company name) + **sortable headers** (`useTableSort`, default by
  company). Each row has **Edit** (`EditItemDialog` — prefilled, can move the item to another
  company) and **Delete** (controlled `AlertDialog`; backend refuses if bill lines reference it).

### Companies (`/companies`) — company master
- A live company count, an "Add company" card (just **Company name** + Add — name only), and a
  card with the companies table (Company + **Actions**). Built with shadcn
  `Card`/`Input`/`Label`/`Button`/`Table`.
- **Search box** (by name) + a **sortable** Company header. Each row has **Edit**
  (`EditCompanyDialog` rename) and **Delete** (controlled `AlertDialog`; backend refuses if items
  or bills reference it).
- Companies are also pickable/creatable inline on the bill header via `CompanyCombobox` +
  `NewCompanyDialog` (see Add Purchase Bill).

### Customers (`/customers`) — customer master (first piece of the Order Book / Sales feature)
- `src/pages/Customers.tsx`. Same Companies/Items master pattern: a live customer count,
  an "Add customer" card, and a card with the customers table + search + sort.
- **Add customer** — a responsive grid (`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`) of all
  9 fields (Name, Nick Name, Mobile, Address 1, Address 2, City, State, Pincode, GSTIN).
  **Only Name and City are required** — Add stays disabled until both are filled; every
  other field can be left blank and filled in later via Edit. **State** is a
  type-to-filter combobox (`StateCombobox`, mirrors `CompanyCombobox`'s interaction —
  same as the Company/Item pickers on Add Purchase Bill) populated from the fixed
  `INDIAN_STATES` list (`@/lib/indianStates`) — not free text, and not a plain dropdown.
  **Mobile** uses `MobileInput` (digits only, capped at 10 characters); if a partial
  number is entered, Add/Save is disabled and an inline "Mobile number must be 10
  digits." error shows (empty stays valid — mobile is optional).
- **Customers table** columns: **Name · Nick Name · Address · City · State · Pincode ·
  GSTIN · Mobile · Actions** — every field is shown; **Address1 and Address2 are merged
  into one Address column** (comma-joined, skipping the join if Address 2 is blank) rather
  than two separate columns. Search matches name, nick name, city, mobile, or GSTIN. Every
  column except Address is sortable (`useTableSort`/`SortableHeader`, same as
  Items/Companies).
- Each row has **Edit** (`EditCustomerDialog` — same 9-field grid + State picker) and
  **Delete** (controlled `AlertDialog`; backend refuses if any sales order still uses it).
- **`EditCustomerDialog` doubles as the quick-add dialog** on Add Order's
  `CustomerCombobox`: passing `customer={null}` switches it to create mode (title/button
  read "Add customer", Name seeded from whatever was typed in the combobox, `AddCustomer`
  instead of `UpdateCustomer`) — same 9-field form and Name+City requirement either way.

### Reports (`/reports`) — top-nav "Reports"
- `src/pages/Reports.tsx`. A **card grid** (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`) — one
  `Card` per downloadable report. Only **Purchase Summary** exists today; a future report is
  just another card, no layout rework needed.
- **Purchase Summary card:** icon + title/description, a **`DateRangeFilter`** (empty = "all
  bills", same semantics as the View/Edit Bills filter — no separate "download all" toggle), a
  live preview line ("N lines across M bills · ₹total", recomputed as the range changes), and a
  **Download Excel** button (disabled while loading/saving or when the range matches zero
  bills, showing "No purchase bills in this range." instead).
- **Data flow:** loads all bills via `ListPurchaseBills`, filters by the chosen range using the
  same inclusive/end-of-day logic as `SavedBills.tsx`, flattens every remaining bill's lines
  into one row per line (computing GST/totals via the shared **`calcLine`**, never re-derived),
  sorts chronologically (date asc, then bill number), and calls the generated
  `ExportPurchaseSummary(rows, defaultFilename)` binding. That Go method opens a native **Save
  File** dialog and writes the `.xlsx` (backed by `internal/reports` + `excelize`) — Go never
  computes report math, only lays out finished numbers. Feedback mirrors other pages:
  `text-emerald-600` "Saved to …" on success, `text-destructive` on error, silent no-op if the
  save dialog is cancelled.
- **The workbook itself:** real typed cells, not text — Date is a genuine Excel date
  (`dd-mmm-yy` custom format, sortable); money columns (Tax Value, D Value, GST Amount, Tax
  Bill Amount, Bill Value, Billing/Final Rate, Discount) are `#,##0.00`; quantity/rate-support
  columns (Pack Size, Tax Qty, D Qty, GST %) are `0.00`; HSN is a plain integer. Header row is
  bold, frozen, and auto-filtered; a bold **Totals** row sums Tax Qty, Tax Value, D Qty,
  D Value, GST Amount, Tax Bill Amount, Bill Value, and Discount — mirroring the footer Totals
  row on the Add/View Bill line-items grid.

### Settings (`/settings`) — top-nav "Settings" (right-aligned group)
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
- **Updates** (second section, same page): shows the running version (`GetAppVersion`); a
  **Check for Updates** button (`CheckForUpdate`) reports either "You're up to date" or an
  "Update available: vX.Y.Z" panel with the release notes and a **Download & Install**
  button (`DownloadAndInstallUpdate`). Clicking Download & Install shows an immediate
  status line ("Downloading and installing… the app will restart automatically") since a
  successful call ends with the app quitting itself — there's no further success message
  to show, just the window closing and reopening. Errors render `text-destructive`, same
  as Database.

## Open decisions
_None blocking._

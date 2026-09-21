# Features

The backlog, grouped by status. When a feature moves to **Planned**, give it a short
spec (what it does, key behaviors). Move items between sections as work progresses:
**Idea → Planned → In Progress → Shipped** (or → Rejected, with a reason).

---

## Shipped
_Shipped in **v0.5.0** (2026-09-20): in-app self-update (Settings → Updates). v0.4.0
(2026-09-20): **Reports** page + Purchase Summary Excel export.
v0.3.0 (2026-06-15): masters edit/delete, sortable + filterable tables with a
date-range filter, Indian (en-IN) number formatting, the reworded unsaved-changes dialog, and the
**top-nav redesign** (sidebar → flat top bar). v0.2.1 (2026-06-10): Company master,
items-belong-to-company, View/Edit Bills (edit/delete), Settings/DB management, batch-1 polish._

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
  cells (`dd-mmm-yyyy`) and typed number cells (accounting-style: money 2-decimal + thousands
  separator, quantity/rate-support columns plain 2-decimal, HSN a plain integer), a frozen +
  auto-filtered header, and a bold Totals row. Report math is computed in the frontend (reuses
  `calcLine`, never re-derived) and handed to a new Go method (`ExportPurchaseSummary`, backed
  by `internal/reports` + `excelize`) that only lays it out and saves it via the native
  save-file dialog.

- **App navigation shell** — a **flat, always-visible top navigation bar** (`src/components/TopNav.tsx`):
  wordmark + all page links in one row (Dashboard · Add Purchase Bill · View/Edit Bills · Items ·
  Companies) with Settings + Logout on the right; active route highlighted. Launches **maximised**;
  **Logout** quits (confirm). Routing via `react-router-dom` (`HashRouter`). (Replaced the original
  collapsible left sidebar per client feedback.)
- **Dashboard (placeholder)** — landing page; centered "Hare Krishna". Real content TBD.
- **Company master** — `companies` (surrogate `id` PK + unique `name`). Companies page under
  *Masters*; picked/created inline on the bill via `CompanyCombobox` + `NewCompanyDialog`.
- **Item master (company-scoped)** — `items` has `id` PK + **`company_id` FK**, unique
  `(company_id, name, pack_size)`. Items page has a company picker + Company column.
- **Add Purchase Bill** — company-first data-entry screen: header (Company combobox, Bill
  number, Date in **dd-mmm-yyyy**) + searchable line items **fetched per company**, live calc
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

## Ideas
_Capture raw feature ideas here as they come up (from us or the client)._

## Rejected
_None yet. When we reject an idea, note it here with a one-line reason._

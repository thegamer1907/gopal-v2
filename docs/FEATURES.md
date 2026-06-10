# Features

The backlog, grouped by status. When a feature moves to **Planned**, give it a short
spec (what it does, key behaviors). Move items between sections as work progresses:
**Idea → Planned → In Progress → Shipped** (or → Rejected, with a reason).

---

## Shipped
_Shipped in **v0.2.1** (2026-06-10): sidebar nav, Company master, items-belong-to-company,
View/Edit Bills (edit/delete), Settings/DB management, and the batch-1 polish. v0.2.0 shipped
the sidebar + Saved Bills + Company master + company FK._

- **App navigation shell** — a **persistent, collapsible left sidebar** (shadcn `sidebar`,
  `src/components/AppSidebar.tsx`): grouped links (Dashboard · *Purchases*: Add Purchase Bill /
  View/Edit Bills · *Masters*: Items / Companies) + a footer (Settings, Logout). Hamburger in
  the header collapses it to an icon rail. Launches **maximised**; **Logout** quits (confirm).
  Routing via `react-router-dom` (`HashRouter`).
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

## In Progress
_None._

## Planned
- **Items edit/delete** (and search / filter by company) as the catalog grows.
- **Company edit/delete** and more company columns (GSTIN, address, …).
- **Dashboard content** — decide the real KPIs / lists.
- **As-billed snapshots** — optionally store GST%/name on the bill line so historical bills
  don't shift when the master changes.

## Ideas
_Capture raw feature ideas here as they come up (from us or the client)._

## Rejected
_None yet. When we reject an idea, note it here with a one-line reason._

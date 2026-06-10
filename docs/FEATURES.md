# Features

The backlog, grouped by status. When a feature moves to **Planned**, give it a short
spec (what it does, key behaviors). Move items between sections as work progresses:
**Idea → Planned → In Progress → Shipped** (or → Rejected, with a reason).

---

## Shipped
- **App navigation shell** — a **persistent, collapsible left sidebar** (shadcn `sidebar`,
  `src/components/AppSidebar.tsx`) with **grouped** links (Dashboard · *Purchases*: Add
  Purchase Bill / Saved Bills · *Masters*: Items), routing via `react-router-dom`
  (`HashRouter`). The header trigger collapses it to an icon-only rail (tooltips on hover).
  Add a page → add a `<Route>` in `App.tsx` + an entry in `AppSidebar.tsx`. (Replaced the
  earlier top-bar nav chips / `Nav.tsx`.)
- **Dashboard (placeholder)** — landing page; currently shows a centered "Hare Krishna".
  Real dashboard content (KPIs / recent activity) to be defined.
- **Item master** — `items` is the product catalog: columns **Item, Pack Size, GST %,
  HSN** (composite PK on name+pack_size). `AddItem`/`ListItems` bound to the Items screen
  (add form + table). Add-only for now; edit/delete to follow.
- **Add Purchase Bill** — full data-entry screen: header (Company, Bill number, Date in
  dd/mm/yyyy) + searchable line items against the cached item master, live calculated
  columns (GST amt, totals, final rates), add-new-item dialog, and transactional save
  (`AddPurchaseBill` → `purchase_bills` + `purchase_bill_items`).
- **Windows build/release CI** — `.github/workflows/build-windows.yml` builds the app on
  `windows-latest` and, on a `v*` tag push, publishes a **GitHub Release** with the `.exe`
  attached (public no-login download link). Repo: `github.com/thegamer1907/gopal-v2`.

## In Progress
- **Settings — Database management** — a Settings page (`/settings`, sidebar footer) whose
  Database section shows the **current DB path** and lets the user **open an existing** `.db`,
  **create a new** one (native file dialogs), or **wipe** the current DB (recreates the empty
  schema). The chosen path **persists** across restarts via `config.json` (`db.ActivePath`),
  with a fallback to the default if a saved path can't be opened. Switching/wiping reloads the
  app. _Awaiting review before Shipped._ Follow-ups: more settings sections; a backup/export.
- **Company master** — `companies` is a master list like Items (**`id` PK + `name`** for now,
  more columns later). Backend `AddCompany`/`ListCompanies` + a dedicated **Companies** page
  under *Masters* (`/companies`, add-only). On the bill header, Company is now a
  `CompanyCombobox` (pick from the master) with **add-new-company on the fly**
  (`NewCompanyDialog`). Bills link to it by **`company_id` FK** → `companies(id)`.
  _Awaiting review before Shipped._ Follow-ups: company edit/delete; more company columns.
- **View saved purchase bills** — read UI built: a **list → detail** page at
  `/purchase-bills` ("Saved Bills" in the sidebar). Backend `ListPurchaseBills` returns all
  bills (header + lines); the list shows Bill #, Company, Date, item count, and total Bill
  Value; clicking opens a read-only line-items grid (same columns as Add). Calc columns are
  recomputed via the shared `src/lib/purchaseBill.ts`. _Awaiting review before Shipped._
  Possible follow-ups: search/filter, per-bill edit/delete, store GST% as-billed.

## Planned
- **Items edit/delete** (and search) as the catalog grows.
- **Dashboard content** — decide the real KPIs / lists.

## Ideas
_Capture raw feature ideas here as they come up (from us or the client)._

## Rejected
_None yet. When we reject an idea, note it here with a one-line reason._

# Features

The backlog, grouped by status. When a feature moves to **Planned**, give it a short
spec (what it does, key behaviors). Move items between sections as work progresses:
**Idea → Planned → In Progress → Shipped** (or → Rejected, with a reason).

---

## Shipped
- **App navigation shell** — top-bar **nav chips** (Dashboard · Add Purchase Bill ·
  Items) routing between pages via `react-router-dom` (`HashRouter`). Add a page → add a
  `<Route>` in `App.tsx` + a chip in `Nav.tsx`.
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
_None._

## Planned
- **View saved purchase bills** — list/detail of bills already entered (no read UI yet).
- **Items edit/delete** (and search) as the catalog grows.
- **Dashboard content** — decide the real KPIs / lists.

## Ideas
_Capture raw feature ideas here as they come up (from us or the client)._

## Rejected
_None yet. When we reject an idea, note it here with a one-line reason._

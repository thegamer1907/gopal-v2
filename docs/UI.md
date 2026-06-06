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
- Icons: **lucide-react**.
- The **frontend-design** plugin/skill is installed — use it when building the real
  screens for a distinctive, polished look beyond the shadcn defaults.

---

## App shell & navigation
- **Layout** (`src/App.tsx`): a **full-height flex column** (`h-full`; `html/body/#root` are
  100% tall — see `index.css`) — a fixed top bar with the **Inventory** brand + **nav chips**
  (`src/components/Nav.tsx`), then a **full-width**, padded `<main>` that flexes to fill the
  window and scrolls internally (`flex-1 overflow-auto`). No max-width cap, so wide screens
  (e.g. the bill line-items grid) use the whole window. Each page lives in `src/pages/`.
- **Nav chips** are pill-shaped `NavLink`s; the active route is filled with the primary
  color, inactive chips are bordered/muted with a hover state.
- **Routing:** `react-router-dom` + `HashRouter` (see `DECISIONS.md`). To add a page:
  create it in `src/pages/`, add a `<Route>` in `App.tsx`, add a chip in `Nav.tsx`.

## Screens
### Dashboard (`/`) — placeholder
- Landing page. Currently a single centered "Hare Krishna". Real content (KPIs / recent
  activity) to be defined.

### Add Purchase Bill (`/purchase-bills/new`) — chip label "Add Purchase Bill"
- **Header card** — Company name, Bill number, Date. Date is a text field in **dd/mm/yyyy**
  (defaults to today) and is stored as entered.
- **Line items** — a wide, horizontally-scrollable grid. Each line:
  - **Item search** (`ItemCombobox`): all items are cached once on load (`ListItems`); typing
    filters and shows suggestions as “name · pack size”. Selecting one fills the line and
    pulls its Pack Size / GST % (shown read-only, used in formulas). The suggestion list is
    **rendered in a portal** (fixed-positioned under the input) so the horizontally-scrolling
    grid doesn't clip it or gain a stray vertical scrollbar.
  - Inputs: **Tax Qty, Tax Value, D-Qty, D-Value, Discount, Remarks**.
  - **Calculated (read-only, muted) columns**, recomputed live:
    GST Amt = TaxValue×GST%/100 · Total Tax Bill Amt = TaxValue+GST Amt ·
    Total Bill Value = Total Tax Bill Amt + D-Value ·
    Final Rate = TotalBillValue/(TaxQty+D-Qty)×PackSize · Final Billing Rate = TaxValue/TaxQty.
  - **Add row** / per-row delete; a **Bill total** (sum of Total Bill Value) below.
- **Add new item on the fly** (`NewItemDialog`): if a search has no match, “Add … as new
  item” opens a dialog (Item / Pack Size / GST % / HSN) → `AddItem` → pushed into the cache
  and selected for the line.
- **Save** persists the whole bill via `AddPurchaseBill` (header + lines, one transaction);
  shows a confirmation and resets the form.
- Built with shadcn `Card`, `Input`, `Label`, `Button`, `Dialog` + lucide icons; the line
  grid is a plain scrollable `<table>` (many columns).

### Items (`/items`) — item master
- A live item count, an "Add item" card (**Item, Pack Size, GST %, HSN** + Add), and a card
  with a table of items (Item / Pack Size / GST % / HSN) with an empty state.
- Built with shadcn `Card`, `Input`, `Label`, `Button`, `Table`. Add-only for now;
  edit/delete to follow.

## Open decisions
_None blocking._

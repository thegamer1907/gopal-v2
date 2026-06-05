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

> The real inventory UI is still to be designed. The current screen is the items skeleton.

---

## Screens
### Items (skeleton)
- Header (app title + live item count), an "Add item" card (name + quantity + Add), and a
  card with a table of items (name, quantity, added date) with an empty state.
- Built with shadcn `Card`, `Input`, `Label`, `Button`, `Table`. Temporary — validates the
  Go↔frontend↔SQLite round-trip on the real UI stack. Replaced by the real inventory UI.

## Open decisions
_None blocking. Real navigation/layout patterns to be established when we design the
actual screens._

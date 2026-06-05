# Work Log

Session journal — **newest entry on top**. Each entry: what we did, decisions made, and
explicit next steps. This is the primary "start where we left off" file: a new session
reads the top entry first.

---

## 2026-06-04 — Frontend stack: shadcn/ui + Tailwind v4
**Did:**
- Chose the UI stack with the user: **shadcn/ui** (new-york, neutral) on **Tailwind v4**,
  **light theme only**. Recorded in `DECISIONS.md` / `UI.md`.
- Bumped the frontend toolchain (Vite 3→6, TS 4.6→5.9, plugin-react 2→4); React stays 18.
- Set up Tailwind v4 (`@tailwindcss/vite`), `@/`→`src/` alias, `src/index.css` theme tokens
  (light, Nunito font), `cn()` util, `components.json`.
- Added shadcn components (button, input, label, card, table) and rebuilt the items screen
  with them (header + add-item card + items table + empty state).
- Verified: `npm run build` ✅ and `go build ./...` (embed) ✅. Removed unused template CSS.

**Decisions:** see `DECISIONS.md` (2026-06-04: shadcn/Tailwind v4/light; toolchain bump).

**Next steps:**
- Brainstorm the real inventory feature set + domain model (replace the `items` skeleton).
- Design the real screens using the frontend-design skill once the model is defined.

---

## 2026-06-04 — Foundation & context system
**Did:**
- Defined the cross-session context system: `docs/` (committed, source of truth) +
  Claude memory (secondary). Created `PROJECT.md`, `FEATURES.md`, `DECISIONS.md`,
  `DATA_MODEL.md`, `UI.md`, `WORKLOG.md`.
- Updated root `CLAUDE.md` with the Project Context + context-sync workflow.
- Locked foundational decisions (see `DECISIONS.md`): SQLite single-file local storage,
  single-user/local, pure-Go `modernc.org/sqlite` driver, local git, Windows build deferred.
- Added the Go SQLite data layer (`internal/db`) and the minimal `items` vertical slice
  (`AddItem`/`ListItems` + basic React screen) to prove the stack.
- Initialized git and made the foundation commit.

**Decisions:** see `DECISIONS.md` (all dated 2026-06-04).

**Next steps:**
- Brainstorm the real inventory feature set with the user/client; record in `FEATURES.md`.
- Design the real domain model (replace the `items` skeleton) in `DATA_MODEL.md`.
- Decide the UI approach (plain CSS vs. component library) and start the real UI in `UI.md`.

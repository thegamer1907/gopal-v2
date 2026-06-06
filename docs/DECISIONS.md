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

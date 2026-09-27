# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context — read this first, every session

This is a **multi-week, multi-session** project: an inventory management desktop app for a
single user on a local Windows laptop (developed on macOS). Features and UI are discovered
iteratively. All durable project context lives in the committed **`docs/`** directory — it
is the source of truth and travels with the repo across machines.

**At the start of every session, read:**
1. `docs/WORKLOG.md` — the top (newest) entry: what was last done and the **next steps**.
2. `docs/FEATURES.md` — the **In Progress** and **Planned** sections: current work.

Then skim `docs/DECISIONS.md` and `docs/DATA_MODEL.md` as the task requires.

### Keeping context in sync (do this as you work — don't wait to be asked)
- **Brainstorm/change a feature** → update `docs/FEATURES.md` (Idea → Planned → In Progress
  → Shipped, or Rejected with a reason).
- **Make any decision** (product or technical) → append a dated entry to `docs/DECISIONS.md`.
- **Change the schema** → update `docs/DATA_MODEL.md` and keep it matching the Go migrations.
- **Decide UI/UX** → update `docs/UI.md`.
- **End of session** → prepend a new entry to `docs/WORKLOG.md` (did / decisions / next
  steps), then `git commit` with a clear message.

Claude memory (`~/.claude/.../memory/`) is **secondary**: it's machine-local and does NOT
travel to Windows. Use it for working preferences and pointers only — the `docs/` files
are authoritative.

## Project Overview

This is a desktop application built with [Wails v2](https://wails.io/) — a framework that combines a Go backend with a React/TypeScript frontend, compiled into a native desktop binary. The app embeds the compiled frontend assets into the Go binary at build time.

## Commands

**Run in development (live reload):**
```sh
wails dev
```
This starts both the Go backend and a Vite dev server. The app is accessible in the desktop window and also at `http://localhost:34115` in a browser (for devtools access to Go methods).

**Build production binary:**
```sh
wails build
```

**Frontend only (from `frontend/` directory):**
```sh
npm run dev      # Vite dev server standalone
npm run build    # TypeScript compile + Vite bundle (outputs to frontend/dist/)
```

**Release:** push a `vX.Y.Z` tag on `main` → the `build-windows.yml` CI builds the Windows
`.exe` and publishes a public GitHub Release (`github.com/thegamer1907/gopal-v2`). **Additive
schema changes need no manual step** — the migration runner applies them automatically
against the client's real database the next time they open the new build, with zero data
loss (see `docs/DATA_MODEL.md`). Only tell the user to reset/wipe their DB for a purely
local, no-real-data-yet dev scenario — **never** as the answer to shipping a schema change
to the client; a genuinely breaking change (rename/drop/retype a column) needs a real
migration instead, since the client's data must not be lost.

## Architecture

The Go/frontend boundary is the core concept here:

- **Go side** (`app.go`): The `App` struct holds application state and exposes public methods. Any public method on `App` is automatically callable from the frontend via generated JS bindings.
- **Bindings** (`frontend/wailsjs/go/main/`): Auto-generated — do not edit manually. They reflect the public API of `app.go`. **After adding/changing a public `App` method, regenerate them** with `wails generate module` (or any `wails dev`/`wails build`) so the frontend sees the new method/types.
- **Frontend** (`frontend/src/`): Standard React + TypeScript. Calls Go methods by importing from `../wailsjs/go/main/App` (e.g., `import {Greet} from "../wailsjs/go/main/App"`).
- **Embedding**: `main.go` embeds `frontend/dist` into the binary with `//go:embed all:frontend/dist`. The frontend must be built before `go build` works standalone.

### Frontend stack
- **React 18 + TypeScript + Vite 6.** Styling via **Tailwind CSS v4** + **shadcn/ui**
  (new-york style, neutral base, **light theme only**).
- shadcn components are **copied into `frontend/src/components/ui/`** and owned/editable
  (not a dependency). Add more with `npx shadcn@latest add <name>` from `frontend/`
  (config: `frontend/components.json`).
- **Path alias `@/` → `frontend/src/`** (`vite.config.ts` + `tsconfig.json`). Import shared
  code as `@/components/...`, `@/lib/utils`, etc.
- Theme tokens + base styles live in `frontend/src/index.css`. The `cn()` helper is in
  `frontend/src/lib/utils.ts`.
- The **frontend-design** skill is available for polished, distinctive UI work.

### Conventions & gotchas (detail lives in `docs/`)
- **React-18 + shadcn `asChild` footgun:** the generated shadcn components are the React-19
  style (plain function components, no `forwardRef`). On our React 18, wrapping our `Button`
  in a Radix `asChild` trigger (Popover/AlertDialog/Tooltip `*Trigger`) silently drops the
  ref, so the thing never opens. Use a **controlled** dialog (open state + handler) or let
  the `*Trigger` render its own button styled with `cn(buttonVariants(...), ...)`. (DECISIONS)
- **Data-entry pages** must (a) disable submit until valid (all required fields filled; `0`
  counts as filled) and (b) wire the unsaved-changes guard (`useUnsavedChanges` →
  `setDirty(isDirty)` + clear on unmount). (DECISIONS / UI)
- **Dates** display/enter as `dd-mmm-yy` via `@/lib/date` (`parseDate` also still accepts
  the legacy `dd-mmm-yyyy` form so pre-2026-09 rows keep working — see docs/DECISIONS.md).
  **Calc formulas live only in one shared file per document type** — Purchase Bill's in
  `@/lib/purchaseBill` (`calcLine`), Sales Order's in `@/lib/salesOrder` (`calcOrderLine`)
  — reused by both the add/edit form and the read-only detail view. Reuse, don't re-derive.
- **Masters use surrogate `id` PKs + FKs** (companies, items, customers); items belong to
  a company, purchase bills reference companies/items by id, and sales orders reference
  customers/items by id (names/GST/pack-size etc. always read back via JOIN, never
  duplicated). Anything derivable from existing rows (calculated bill columns, item stock,
  a customer's rate history for an item) is computed on read, never stored — see
  docs/DATA_MODEL.md and docs/DECISIONS.md for the specific examples.

### Data layer
- **SQLite, single file**, opened via the `internal/db` package. Default path is
  `os.UserConfigDir()` → `<config>/gopal-v2/inventory.db`, but the **active path is
  user-configurable** (Settings → Database; persisted in `config.json`, resolved by
  `db.ActivePath`). Never hardcode the path; always go through `internal/db`.
- **Pure-Go driver** `modernc.org/sqlite` (no CGO) — keeps Mac dev and the eventual Windows
  build simple. Do not switch to a CGO driver without recording it in `docs/DECISIONS.md`.
- **Migrations:** see `docs/DATA_MODEL.md` for the full policy. Short version — **additive**
  changes (new table, new defaulted column) just get appended to the `migrations` slice in
  `internal/db/migrate.go`; the runner applies them automatically and safely to *any*
  database, including the client's real one, with zero data loss. "Reset/wipe the dev DB"
  is a **local-dev-only** convenience for iterating before a migration ships — never
  something to do to, or suggest for, the client's database. A **breaking** change
  (rename/retype/drop an existing column) needs a real, hand-written migration that
  transforms existing rows, not a slice append. Keep `docs/DATA_MODEL.md` in sync with every
  migration.

## Key Files

- `app.go` — Add new Go methods here to expose them to the frontend
- `main.go` — Wails app initialization and window configuration
- `internal/db/` — SQLite open/path-resolution/migrations
- `wails.json` — Project config (name, build scripts, author)
- `frontend/src/App.tsx` — Main React component
- `docs/` — Durable cross-session project context (source of truth)

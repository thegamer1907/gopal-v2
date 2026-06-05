# Project: gopal-v2 — Inventory Management Desktop App

## What we're building
A desktop inventory management application for a single user, running locally on a
Windows laptop. Built with Wails v2 (Go backend + React/TypeScript frontend), shipped
as a native Windows executable.

## Who it's for
A single end user (client-driven). One person, one machine. No multi-user, no accounts,
no network/cloud component.

## Hard constraints
- **Target platform:** Windows laptop (final deliverable). Developed on macOS.
- **Single user, local only:** no authentication, no sync, no server.
- **Storage:** SQLite — one local `.db` file, auto-created on first launch in the
  per-user app folder (`%APPDATA%\gopal-v2\inventory.db` on Windows;
  `~/Library/Application Support/gopal-v2/inventory.db` on macOS during dev). Resolved
  in Go via `os.UserConfigDir()`.
- **Pure-Go SQLite driver** (`modernc.org/sqlite`) to avoid CGO toolchain pain when
  building for Windows.

## Current status
**2026-06-04 — Foundation phase.** Setting up the cross-session context system (this
`docs/` directory) and the technical foundation (SQLite data layer + a minimal items
vertical slice to prove the Go↔frontend↔SQLite stack). The real inventory feature set
and UI are not yet defined — they'll be brainstormed and recorded in `FEATURES.md`,
`DATA_MODEL.md`, and `UI.md` as we go.

## How this project stays resumable across sessions
See the other files in `docs/` (the source of truth, committed to git) and the
"Project Context" section of the root `CLAUDE.md`. New sessions start by reading
`WORKLOG.md` (latest entry) and `FEATURES.md` (In Progress / Planned).

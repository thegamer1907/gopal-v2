# Work Log

Session journal — **newest entry on top**. Each entry: what we did, decisions made, and
explicit next steps. This is the primary "start where we left off" file: a new session
reads the top entry first.

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

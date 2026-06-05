# Data Model

The evolving SQLite schema. Update this whenever a table/field/relationship changes, and
keep it in sync with the migrations in the Go DB layer.

> **Status:** Skeleton only. The real inventory domain model (stock levels, categories,
> suppliers, transactions, etc.) is not yet designed — it will be defined in the first
> feature brainstorm and captured here.

---

## Tables

### `items` (skeleton — proves the stack; not the final model)
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `name` | TEXT NOT NULL | |
| `quantity` | INTEGER NOT NULL DEFAULT 0 | |
| `created_at` | TEXT NOT NULL | ISO-8601 timestamp |

## Migrations
Migrations run on startup from the Go DB layer (`internal/db`). Each migration is
applied once and tracked. Keep this section's table definitions matching the actual
migration SQL.

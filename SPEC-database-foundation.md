# Spec: Knoprix Versioned Database Foundation

**Module:** `database-foundation`
**Status:** Draft for approval
**Backlog:** `tasks/todo.md`, Phase 0, Task 0.3
**Plan:** `tasks/plan.md`, Phase 0

## Objective

Replace implicit, unversioned startup schema changes with an ordered,
repeatable migration path for Knoprix's existing SQLite and PostgreSQL
databases. Existing users, projects, documents, bookmarks, highlights, and
derived search indexes must survive upgrades. The migration runner is the
data foundation for later grants, ingestion jobs, and sharing.

## Tech Stack

- Python, using the existing `sqlite3` connection and PostgreSQL compatibility
  adapter in `backend/app/database.py`.
- Keep current application SQL and database configuration compatible.
- Use the Python standard library and the already-installed database drivers;
  do not add a migration dependency for this slice.

## Commands

Run from `knoprix-final-project/backend`:

```sh
.venv/bin/python -m unittest qa_database_migrations
.venv/bin/python -m unittest qa_firebase_auth qa_bookmarks qa_file_formats
```

The new focused migration suite must use disposable SQLite files. A PostgreSQL
integration run is permitted only against a separately configured disposable
database; it must never use the deployed or shared database.

## Project Structure

- `backend/app/database.py` — migration discovery/application and startup hook.
- `backend/qa_database_migrations.py` — fresh, legacy-upgrade, repeat-startup,
  data-preservation, and failure/rollback tests.
- `backend/app/migrations/` — ordered migration definitions, if needed to keep
  the runner separate from persistence/connection code.
- `tasks/plan.md` and `tasks/todo.md` — existing plan and acceptance checklist.

## Code Style

Keep the public `connect()` / `init_db()` behavior and the SQLite-style
connection API used by routers. Each migration has a stable increasing version,
is idempotent for supported legacy states, and is marked applied only after its
changes succeed. Keep data changes explicit and bounded; do not hide new
schema changes in untracked startup conditionals.

## Testing Strategy

- Fresh SQLite database: initialization creates the current schema and records
  each applied migration.
- Legacy SQLite database: upgrade preserves row identities and relationships
  for users, projects, documents, bookmarks, highlights, and `dsa_indices`.
- Legacy compatibility: existing additive column/index upgrades and the
  pre-existing legacy filename cleanup are retained as versioned, repeat-safe
  work.
- Repeat startup: a second initialization applies no migration twice and
  leaves preserved records unchanged.
- Failure: a failed migration leaves no applied-version record and rolls back
  its transactional changes where the engine supports transactional DDL.
- Regression: existing Firebase-auth, bookmark, and file-format tests pass.
- PostgreSQL behavior must be exercised only with an explicitly configured
  disposable database; if none is available, report that limitation rather
  than claiming PostgreSQL runtime verification.

## Boundaries

- **Always:** preserve existing data and legacy route behavior; use isolated
  disposable databases for migration tests; retain the existing filename
  cleanup edit in `backend/app/database.py`; keep migration application
  repeatable and transactional where supported.
- **Ask first:** destructive schema changes, external services or dependencies,
  and any test that would connect to a shared/deployed database.
- **Never:** drop or rewrite user data to make a migration pass; put secrets in
  fixtures/logs; use production/staging credentials; deploy or push without
  separate explicit approval.

## Success Criteria

1. A fresh SQLite database initializes successfully and records applied
   migration versions.
2. An existing supported SQLite schema upgrades without losing the listed
   records or their key relationships.
3. Repeated initialization is idempotent.
4. A migration failure is surfaced, is not recorded as successful, and rolls
   back transactional changes.
5. Focused migration and regression suites pass locally.
6. PostgreSQL is reported as unverified unless the same acceptance checks run
   against a disposable PostgreSQL database.

## Open Questions

- None for the SQLite migration slice. PostgreSQL runtime validation requires
  an isolated disposable database; do not infer access to one from the
  repository's deployment configuration.

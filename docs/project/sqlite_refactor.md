### Refactor Task Instructions: PostgreSQL → SQLite

**Objective**
Refactor the application from a PostgreSQL-backed design to a SQLite-based design optimized for a single-user, low-concurrency, cost-sensitive deployment. This refactor includes project cleanup, schema changes, data access updates, documentation revisions, and test updates.

---

### 1. Project & File Structure Cleanup

* Remove PostgreSQL-specific dependencies, configuration files, and environment variables.
* Delete or archive migration tooling and scripts that assume a client–server database (e.g., Alembic/Flyway, connection pool configs).
* Introduce a dedicated `data/` (or equivalent) directory for the SQLite database file and related artifacts.
* Update `.gitignore` to exclude runtime SQLite database files and temporary copies.

---

### 2. Database & Data Access Refactor

* Replace PostgreSQL connection logic with SQLite connection handling.
* Remove connection pooling and server-side transaction assumptions.
* Update schema definitions to SQLite-compatible types and constraints.
* Ensure foreign keys, indexes, and constraints are explicitly enabled and tested in SQLite.
* Adjust write patterns to assume a single writer and serialized updates.

---

### 3. Application Logic Updates

* Update data access layer to use file-based lifecycle (open → operate → close).
* Introduce clear boundaries for read vs. write operations.
* Ensure writes are atomic and fail-safe (transaction + commit).
* Remove logic that assumes concurrent sessions or long-lived connections.

---

### 4. Tests (Revised & New)

* Update existing tests to run against SQLite instead of PostgreSQL.
* Remove database startup/teardown steps tied to external services.
* Add tests for:

  * SQLite schema creation and integrity
  * Basic CRUD operations for all entities
  * Transaction behavior and rollback
  * Database file initialization and reuse
* Ensure all tests run locally without external infrastructure.

---

### 5. Documentation Updates

* Update architecture and design documentation to reflect SQLite usage.
* Document database file location, lifecycle, and backup strategy.
* Remove references to PostgreSQL setup, tuning, and operational requirements.
* Add a brief rationale section explaining the SQLite choice and constraints.

---

### 6. Desired End State

* Application runs without any external database service.
* All data is persisted in a single SQLite database file.
* Tests are fast, self-contained, and deterministic.
* Documentation accurately reflects the new architecture.
* PostgreSQL is no longer a required or referenced dependency.

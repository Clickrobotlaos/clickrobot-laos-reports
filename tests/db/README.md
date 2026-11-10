# Database harness (local only — never connects to Supabase)

`bash tests/db/run.sh` (or `npm run test:db`) starts a throwaway Postgres in a temp dir and:

1. loads `harness/00_supabase_stubs.sql` (anon/authenticated roles, `auth.uid()` from JWT claims, Supabase default grants),
   `harness/10_legacy_schema.sql` (schema-only production snapshot), the deployed v0.4 foundation, and test helpers;
2. runs `supabase/tests/rls_negative_tests.sql`;
3. loads FICTIONAL fixtures and runs `assert_legacy.sql` in **baseline** mode, which must reproduce each audited vulnerability;
4. applies `supabase/proposed/0001..0004` twice, then runs `assert_legacy.sql` in **fixed** mode plus `assert_after_migrations.sql`;
5. applies the rollbacks in reverse, re-applies forward, and re-asserts.

Requires Postgres ≥ 15 binaries (`PGBIN` to override). Production runs Postgres 17; nothing here is version-specific.

## Refreshing the schema snapshot (read-only)
If production schema changes, regenerate `harness/10_legacy_schema.sql` with a read-only catalog query
(tables, constraints, indexes, functions, triggers, RLS flags, policies, views for `public` excluding `cr360_*`/`nova_*`).
The exact read-only query is `tests/db/snapshot_query.sql`. Never dump data, only DDL.

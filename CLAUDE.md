# Scaliyo (AuraEngine) — working notes

React 19 + TypeScript + Vite in `AuraEngine/`; Supabase (Postgres + edge functions) in `supabase/`.

## Deploying

- **Frontend**: push `master` → GitHub Actions → VPS symlink swap. Both `ZsnSolutions9920/AuraEngine` (`origin`) and `zsnsolutions-hub/aurafunnel` (`legacy`) deploy to the same box; which one you can push to depends on the `gh` account and whether the commit touches `.github/workflows/**`.
- **Migrations**: `supabase db push` (CLI is linked; credentials cached).
- **Edge functions**: `supabase functions deploy <name>`. Do **not** pass `--no-verify-jwt` unless the function is already listed with `verify_jwt = false` in `supabase/config.toml` — the flag changes the deployed config, so passing it by habit silently removes the platform's JWT gate.
- **Security tests**: `supabase/tests/security_invariants.sql` — role-simulated, wrapped in a transaction that always rolls back. Extend it whenever you close a hole.

## Schema changes that can break the running app

The frontend and the database deploy **separately**, and the database usually wins the race — `db push` takes seconds, a frontend deploy takes minutes. So a migration that removes something the live JS still uses breaks production for the gap between them.

The sharpest edge is **column-level `REVOKE`**. Postgres rejects the *entire* query when `SELECT *` expands over a column the role can't read — it does not quietly omit the column. So revoking one column from `authenticated` breaks every `select('*')` on that table at once. This has bitten this repo for real: revoking `profiles."businessProfile"` took down `useAuthMachine`'s `select('*')`, i.e. login, app-wide.

Sequence these as **expand → migrate → contract**, in three separate deploys:

1. **Expand** (additive only, safe to land alone): add the new accessor RPC / view / column. Nothing is taken away, so old and new clients both work.
2. **Migrate**: ship the frontend + edge functions that use the new path. Now nothing reads the old one.
3. **Contract**: land the `REVOKE` / `DROP` in a *later* migration.

Put steps 1 and 3 in different migration files even when you write them in the same sitting — one file that both adds the accessor and revokes the column cannot be deployed safely, because applying it is atomically both steps.

Before any `REVOKE ... FROM authenticated`, grep for `select('*')` against that table:

```
grep -rn "from('<table>')" --include=*.ts --include=*.tsx AuraEngine/ | grep -v node_modules
```

Service-role code (edge functions) is exempt — it bypasses column ACLs.

## Secrets at rest

Third-party credentials are AES-encrypted via `app_encrypt_secret` / `app_decrypt_secret` (pgcrypto + a Vault key, `'v1:'` ciphertext prefix, passthrough for legacy plaintext). Writers get a `BEFORE INSERT/UPDATE` trigger — `tg_encrypt_secret_columns('col', ...)` for text columns, or a table-specific one for JSONB — so no writer has to remember. Readers decrypt as service_role via `supabase/functions/_shared/tokenCrypto.ts`.

When adding a crypto helper, **revoke EXECUTE from `anon` and `authenticated` by name**. Supabase's default privileges grant it to those roles explicitly, and `REVOKE ... FROM PUBLIC` does not undo a grant made by name — miss this and the helper becomes a decrypt oracle callable from the browser.

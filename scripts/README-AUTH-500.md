# Fixing 500 on Login (auth/v1/token?grant_type=password)

A **500** from `https://your-project.supabase.co/auth/v1/token` when logging in usually means something in the **database** or **Auth config** is failing during the sign-in flow.

## 1. Check the real error

1. Open **Supabase Dashboard** → your project.
2. Go to **Logs** → **Auth** (or **Postgres**).
3. Find the log line for the failing request and read the error message (e.g. trigger error, constraint violation, permission).

That message is what you need to fix.

## 2. If the user was created with SQL (44-seed-superadmin.sql)

Inserting directly into `auth.users` can leave the row in a state that Auth doesn’t expect when it updates the row on login (e.g. `last_sign_in_at`), which can lead to 500s.

**Recommended: create the user via Dashboard, then link in `public.users`**

1. In **Supabase Dashboard** → **Authentication** → **Users** → **Add user**:
   - Email: `admin@pharmacare.local`
   - Password: (choose a secure one)
   - Confirm email: on (or confirm via email).
2. After creation, copy the user’s **UUID** from the users list.
3. In **SQL Editor**, run (replace the UUID and name if you like):

```sql
INSERT INTO public.users (id, email, full_name, role, tenant_id)
VALUES (
  'paste-the-uuid-from-dashboard-here',
  'admin@pharmacare.local',
  'Super Admin',
  'superadmin',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  role = 'superadmin',
  tenant_id = NULL,
  full_name = EXCLUDED.full_name;
```

4. Log in with the same email and password you set in the Dashboard.

## 3. Triggers on auth tables

If Auth logs or Postgres logs mention a **trigger** or **function**:

1. Run **`scripts/auth-500-troubleshoot.sql`** in the SQL Editor to list triggers on `auth.users` and `auth.identities`.
2. If a trigger syncs to `public.users` (or elsewhere) and fails (e.g. RLS, NOT NULL), fix or temporarily disable that trigger, or fix the target table/RLS so the trigger can succeed.

## 4. RLS / policies

If the error points to **permission** or **RLS**:

- Make sure you’ve run **`scripts/45-rls-allow-superadmin.sql`** so the superadmin can read their row in `public.users` and the rest of the app can load after login.

## 5. Quick recap

| Step | Action |
|------|--------|
| 1 | Check **Logs → Auth / Postgres** for the exact error. |
| 2 | Prefer **creating the user in Dashboard**, then inserting only into `public.users` with the same UUID and `role = 'superadmin'`. |
| 3 | Use **auth-500-troubleshoot.sql** to inspect triggers on auth tables. |
| 4 | Ensure **45-rls-allow-superadmin.sql** has been applied. |

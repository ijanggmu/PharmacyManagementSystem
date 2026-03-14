-- Run this in Supabase SQL Editor to help diagnose 500 on /auth/v1/token (login).
-- Then check: Dashboard → Logs → Auth (and Postgres) for the exact error.

-- 1) List triggers on auth.users (a failing trigger can cause 500 on login)
SELECT tgname AS trigger_name, proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'auth' AND c.relname = 'users';

-- 2) List triggers on auth.identities
SELECT tgname AS trigger_name, proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'auth' AND c.relname = 'identities';

-- 3) If a trigger syncs to public.users and fails, you can temporarily disable it (replace name):
-- ALTER TABLE auth.users DISABLE TRIGGER "name_from_above";

-- 4) Ensure auth user has required timestamps (fixes some 500s when row was inserted via SQL)
-- Replace YOUR_AUTH_USER_UUID with the admin user's id from Auth → Users.
/*
UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  confirmed_at = COALESCE(confirmed_at, NOW()),
  updated_at = NOW()
WHERE id = 'YOUR_AUTH_USER_UUID';
*/

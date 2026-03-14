-- Seed superadmin: create auth user with password and public.users row (all in SQL).
-- Run in Supabase SQL Editor. Replace the variables in the DO block and execute.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_email TEXT := 'admin@pharmacare.local';
  v_password TEXT := 'SuperAdmin123!';
  v_name TEXT := 'Super Admin';
  v_encrypted_pw TEXT;
BEGIN
  v_encrypted_pw := crypt(v_password, gen_salt('bf'));

  -- auth.users (include confirmed_at so Auth login flow doesn't 500)
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at),
    confirmed_at = COALESCE(auth.users.confirmed_at, EXCLUDED.confirmed_at),
    updated_at = NOW();

  -- auth.identities (required for email sign-in)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at
  ) VALUES (
    v_id,
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email',
    v_id::text,
    NOW(),
    NOW()
  )
  ON CONFLICT (provider, provider_id) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    updated_at = NOW();

  -- public.users (app role)
  INSERT INTO public.users (id, email, full_name, role, tenant_id)
  VALUES (v_id, v_email, v_name, 'superadmin', NULL)
  ON CONFLICT (id) DO UPDATE SET
    role = 'superadmin',
    tenant_id = NULL,
    full_name = EXCLUDED.full_name;

  RAISE NOTICE 'Superadmin created. Email: %, Password: %', v_email, v_password;
END $$;

-- Optional: only UPDATE password for an existing auth user (replace UUID and password):
/*
UPDATE auth.users
SET
  encrypted_password = crypt('YourNewPassword', gen_salt('bf')),
  updated_at = NOW()
WHERE id = 'existing-user-uuid-here';
*/

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
  v_existing_id UUID;
BEGIN
  v_encrypted_pw := crypt(v_password, gen_salt('bf'));

  SELECT id INTO v_existing_id FROM auth.users WHERE email = v_email LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    v_id := v_existing_id;
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(auth.users.email_confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_id;
  ELSE
    -- auth.users (confirmed_at may be generated in newer Supabase auth schemas)
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
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
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      NOW(),
      NOW()
    );
  END IF;

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

#!/usr/bin/env node

/**
 * Seed a superadmin user (Supabase Auth + public.users).
 *
 * Loads .env.local from project root if present.
 * Default user: admin@pharmacare.local / SuperAdmin123!
 * Override with SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD (and optional SUPERADMIN_NAME).
 */

const fs = require("fs")
const path = require("path")

// Load .env.local from project root (next to package.json)
const root = path.resolve(__dirname, "..")
const envPath = path.join(root, ".env.local")
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8")
  content.split("\n").forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) {
      const val = m[2].replace(/^["']|["']$/g, "").trim()
      process.env[m[1]] = val
    }
  })
}

const { createClient } = require("@supabase/supabase-js")

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const emailFinal = process.env.SUPERADMIN_EMAIL || "admin@pharmacare.local"
const passwordFinal = process.env.SUPERADMIN_PASSWORD || "SuperAdmin123!"
const nameFinal = process.env.SUPERADMIN_NAME || "Super Admin"

if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

if (!process.env.SUPERADMIN_EMAIL || !process.env.SUPERADMIN_PASSWORD) {
  console.warn("Using dev defaults: admin@pharmacare.local / SuperAdmin123! (set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD to override)")
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log("Creating superadmin auth user...")

  const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
    email: emailFinal,
    password: passwordFinal,
    email_confirm: true,
    user_metadata: { full_name: nameFinal },
  })

  if (createError) {
    const isDuplicate =
      createError.message && (
        createError.message.includes("already been registered") ||
        createError.message.includes("already exists")
      )
    if (isDuplicate) {
      console.log("Auth user already exists. Ensuring public.users row exists...")
      let page = 1
      let user = null
      while (true) {
        const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
        const u = data?.users?.find((u) => u.email === emailFinal)
        if (u) {
          user = u
          break
        }
        if (!data?.users?.length) break
        page++
      }
      if (!user) {
        console.error("Could not find existing auth user by email. Create the user in Supabase Dashboard → Auth → Users, then run this script again.")
        process.exit(1)
      }
      const { error: insertError } = await supabase.from("users").upsert(
        {
          id: user.id,
          email: emailFinal,
          full_name: nameFinal,
          role: "superadmin",
          tenant_id: null,
        },
        { onConflict: "id" }
      )
      if (insertError) {
        console.error("Failed to upsert users row:", insertError.message)
        process.exit(1)
      }
      console.log("Superadmin app user synced. Sign in with:", emailFinal)
      process.exit(0)
      return
    }
    console.error("Failed to create auth user:", createError.message)
    process.exit(1)
  }

  if (!authUser?.user) {
    console.error("No user returned from createUser")
    process.exit(1)
  }

  const { error: insertError } = await supabase.from("users").insert({
    id: authUser.user.id,
    email: emailFinal,
    full_name: nameFinal,
    role: "superadmin",
    tenant_id: null,
  })

  if (insertError) {
    console.error("Auth user created but failed to insert public.users:", insertError.message)
    process.exit(1)
  }

  console.log("Superadmin created. Sign in with:", emailFinal)
}

main()

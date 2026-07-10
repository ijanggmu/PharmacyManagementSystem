# Deployment checklist (v1.0)

## 1. Database

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill in keys.
3. Run migrations in order:

   ```bash
   yarn migrate
   ```

4. Seed superadmin if needed: `yarn seed:superadmin`

## 2. Application

```bash
yarn install
yarn build
yarn start
```

Deploy to Vercel (or similar) with the same environment variables.

## 3. Post-deploy smoke test

- [ ] Sign in / onboarding creates tenant + admin
- [ ] New sale (cash and credit) posts inventory and GL vouchers
- [ ] GRN receive updates supplier AP
- [ ] Accounting → VAT return loads for current month
- [ ] Accounting → AR aging loads (if credit sales exist)
- [ ] IRD report page loads for admin
- [ ] Migrations page shows all scripts applied

## 4. Operations

- Enable Supabase backups and RLS review per tenant.
- Document pharmacy IRD credentials in tenant settings (not in git).
- Close fiscal periods in Accounting before month-end lock.

# .NET backend cutover: changelog

## Default backend

- Every area in `lib/api/backend-target.ts` defaults to the .NET API. Set `NEXT_PUBLIC_BACKEND_TARGET_<AREA>=nextjs` to roll back a single area.
- Supabase code is kept and switched off by default. Nothing is deleted.
- Checkout on .NET is opt-in (`NEXT_PUBLIC_CHECKOUT_ON_DOTNET=true`). The .NET sale enforces the interaction, allergy, controlled-substance and prescription checks.

## Authentication

- The browser never holds a bearer token. The BFF (`app/api/dotnet/auth/*`) sets httpOnly `fsh_access` and `fsh_refresh` cookies. Browser-side calls go through `app/api/dotnet/[...path]`.
- Self-registration does not require email confirmation. Accounts are created with `EmailConfirmed=true`.
- Access tokens carry one `permission` claim per permission. The frontend checks these through `lib/api/dotnet-permissions.ts`.
- Rotated tokens are written back to the cookies from `requireAuth` in route handlers, and from middleware for page requests.
- Old Supabase users are retired. Users re-register through the website.

## Permissions

- New: `Permissions.Prescriptions.ControlledSubstances.Dispense`, granted to Pharmacist and Admin. CreateSale returns 403 for a controlled medicine without it.
- Not granted to Manager, which the legacy system allowed. Add it to `PharmacyRoleSeedData` if Manager should keep this right.

## Prescriptions

- A line needs a valid, unexpired prescription when the medicine is controlled or has `PrescriptionRequired` set.

## Seeding

- `DbMigrator apply` applies migrations. `DbMigrator seed` seeds the superadmin. `DbMigrator seed-pharmacy` creates the demo pharmacy from the `SeedPharmacy` config section.
- No business data is migrated.

## IRD

- `HttpIrdDispatchClient` replaces the stub. Per-tenant settings come from `IrdOptions`. `ProcessIrdInvoiceQueueJob` runs as a recurring Hangfire job.

## Not yet verified

- No test suite or end-to-end run has been executed on this code.
- JWT size with permission claims has not been measured for an admin account. If it approaches the proxy header limit, send only the permissions the frontend checks.

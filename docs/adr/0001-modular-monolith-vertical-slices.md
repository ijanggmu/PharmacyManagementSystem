# 0001. Modular monolith with vertical slices (FullStackHero starter kit)

- **Status:** Accepted
- **Date:** 2026-09-09 (date of the implementation plan, `docs/pharmacy-modules-plan.md`)

## Context

PharmaCare started as a Next.js app on Supabase, with business rules spread across Route Handlers and
Postgres RLS/triggers. Moving the backend to .NET called for a structure that keeps the domains
(inventory, sales, accounting, purchasing, prescriptions, …) separate. It also had to provide
multitenancy, identity, auditing, jobs and observability without building them from scratch. The team is
small, so running many services was not affordable.

## Decision

Build on the **FullStackHero .NET starter kit** as a **modular monolith** using **Vertical Slice Architecture**:

- One deployable API (`src/Host/FSH.Starter.Api`). Each bounded context is a module in `src/Modules/{Name}`
  with a runtime project plus a `.Contracts` project, and the `.Contracts` project is its only public API.
- Modules reference each other **only through `.Contracts`**. `Architecture.Tests` (NetArchTest) enforces this.
- Each feature is a slice (command/query → handler → validator → endpoint) using Mediator, FluentValidation and
  minimal APIs.
- Each module has its own `DbContext` on one PostgreSQL database. Tenant isolation is on by default via
  `BaseDbContext` (Finbuckle).
- Pharmacy domains were added as new modules (Reference, Suppliers, Customers, Accounting, Inventory,
  Purchasing, Prescriptions, Sales, Onboarding, later Payroll). Starter-kit modules are kept where useful.

Conventions: `/AGENTS.md` and `/.agents/rules/architecture.md`.

## Consequences

- **+** One process, one database, one deploy. Simple to run on a single VPS (see ADR 0005).
- **+** Boundaries are enforced by tests, so a module can later be extracted to its own service. ADR 0002 keeps
  cross-module workflows compatible with that.
- **+** Multitenancy, auth, auditing, Hangfire, the Outbox and health checks come from the kit.
- **−** Registering a module touches four places (both `Program.cs` files: Mediator markers + module list).
  A missed Mediator marker silently drops handlers.
- **−** Cross-module atomicity is not available for free (see ADR 0002).
- **−** The repo carries starter-kit code and conventions that must be kept in sync with, or pruned from, upstream
  (see ADR 0004). `src/BuildingBlocks` is protected and changes there need explicit approval.

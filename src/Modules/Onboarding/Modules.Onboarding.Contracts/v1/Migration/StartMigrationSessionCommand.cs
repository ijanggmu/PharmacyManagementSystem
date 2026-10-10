using Mediator;

namespace FSH.Modules.Onboarding.Contracts.v1.Migration;

/// <summary>
/// Starts the tenant's opening-balance migration wizard (port of the Next.js migration-service.ts
/// "Level 1 — Quick Start" flow: <c>startMigrationSession</c>). One <c>MigrationSession</c> row per
/// tenant, mirroring the Postgres <c>migration_sessions</c> table (scripts/99) — a second call while a
/// session already exists is rejected (409), same as the original <c>startMigrationSession</c> guard.
/// </summary>
public sealed record StartMigrationSessionCommand(DateOnly CutoverDate, string? Notes = null) : ICommand<Guid>;

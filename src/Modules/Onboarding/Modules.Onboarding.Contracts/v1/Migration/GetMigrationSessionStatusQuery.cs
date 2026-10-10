using FSH.Modules.Onboarding.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Onboarding.Contracts.v1.Migration;

/// <summary>
/// Port of <c>getMigrationSession</c> — returns <c>null</c> data (not a 404) when no session has been
/// started yet for this tenant, matching the Next.js service's "session is null, that's fine" contract.
/// </summary>
public sealed record GetMigrationSessionStatusQuery : IQuery<MigrationSessionStatusDto?>;

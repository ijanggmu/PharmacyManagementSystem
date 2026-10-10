namespace FSH.Modules.Onboarding.Domain;

/// <summary>Lifecycle of a <see cref="MigrationSession"/> — mirrors the Postgres
/// <c>migration_sessions.status</c> check constraint ("draft"/"completed") in scripts/99.</summary>
public enum MigrationSessionStatus
{
    Draft = 0,
    Committed = 1,
}

/// <summary>Which opening-balance category a <see cref="MigrationLineItem"/> belongs to — one per
/// <c>app/api/migration/opening-*</c> route on the Next.js side.</summary>
public enum MigrationCategory
{
    Cash = 0,
    Bank = 1,
    Customer = 2,
    Supplier = 3,
    Stock = 4,
}

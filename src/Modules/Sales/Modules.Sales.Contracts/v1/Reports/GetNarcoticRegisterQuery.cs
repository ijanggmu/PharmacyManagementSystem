using FSH.Framework.Shared.Persistence;
using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Reports;

/// <summary>
/// Controlled-substance (narcotic/DDA) dispensing register for completed sales with a
/// <c>SaleDateUtc</c> in [<paramref name="PeriodStartUtc"/>, <paramref name="PeriodEndUtc"/>] — one
/// row per dispensed line item of a medicine flagged <c>Inventory.Medicine.IsControlled</c>. Regulatory
/// register; .NET port of the Next.js reference's <c>dda_narcotic_register</c> view
/// (scripts/33-ird-invoices-and-narcotic-register.sql, scripts/35-add-controlled-substance-schedule.sql,
/// served by <c>getDdaNarcoticRegister</c> in lib/server/services/reports-service.ts).
///
/// <b>Faithfulness gap</b> — the ported <c>Prescription</c> entity has no prescription-number or
/// doctor-license fields (architecture.md restricts this port to read-queries over already-migrated
/// columns, so these were not invented). Rows therefore carry <see cref="NarcoticRegisterRowDto.DoctorName"/>
/// and <see cref="NarcoticRegisterRowDto.PrescriptionId"/> but omit prescription number, doctor license
/// and strength/form — see the DTO's remarks. The schedule is filtered from Inventory's
/// <c>ControlledSchedule</c> (not returned on rows).
/// </summary>
/// <param name="PeriodStartUtc">Inclusive start of the sale-date window.</param>
/// <param name="PeriodEndUtc">Inclusive end of the sale-date window.</param>
/// <param name="MedicineName">Optional case-insensitive "contains" filter on the medicine name.</param>
/// <param name="DoctorName">Optional case-insensitive "contains" filter on the prescribing doctor's name.</param>
/// <param name="Schedule">Optional case-insensitive exact match on the medicine's controlled-substance schedule.</param>
/// <param name="PageNumber">1-based page number (default 1).</param>
/// <param name="PageSize">Rows per page (default 50, max 200).</param>
/// <param name="BranchId">Branch (premises) whose register to show; null = all branches the caller may see.</param>
public sealed record GetNarcoticRegisterQuery(
    DateTime PeriodStartUtc,
    DateTime PeriodEndUtc,
    string? MedicineName = null,
    string? DoctorName = null,
    string? Schedule = null,
    int PageNumber = 1,
    int PageSize = 50,
    Guid? BranchId = null)
    : IQuery<PagedResponse<NarcoticRegisterRowDto>>;

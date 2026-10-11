using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Returns;

/// <summary>Debit notes (supplier returns) dated in the period, for the IRD purchase register. In-process.</summary>
public sealed record GetSupplierDebitNotesQuery(
    DateTime PeriodStartUtc,
    DateTime PeriodEndUtc,
    Guid? BranchId = null) : IQuery<IReadOnlyList<SupplierDebitNoteRegisterDto>>;

using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;

/// <summary>
/// Lots at the caller's branch that expire within <paramref name="WithinDays"/> (expired ones included),
/// grouped by the supplier that delivered them. Consigned lots are left out (the supplier's own stock is
/// settled, not claimed), and so is what open claims already hold.
/// </summary>
public sealed record GetExpiryClaimCandidatesQuery(int WithinDays = 90, Guid? SupplierId = null)
    : IQuery<IReadOnlyList<ExpiryClaimCandidateGroupDto>>;

public sealed record ExpiryClaimLineInput(Guid BatchId, decimal Quantity);

/// <summary>Creates a Draft claim to <paramref name="SupplierId"/> for lots of the caller's branch.</summary>
public sealed record CreateExpiryClaimCommand(Guid SupplierId, IReadOnlyList<ExpiryClaimLineInput> Lines, string? Notes = null)
    : ICommand<Guid>;

public enum ExpiryClaimAction
{
    /// <summary>Draft → Sent (the claim letter went to the supplier).</summary>
    MarkSent = 0,

    /// <summary>Draft / Sent → Rejected. Needs <see cref="ChangeExpiryClaimStatusCommand.Reason"/>.</summary>
    Reject = 1,

    /// <summary>Accepted → Credited (the supplier's credit note arrived); <see cref="ChangeExpiryClaimStatusCommand.Reference"/> = its number.</summary>
    MarkCredited = 2,
}

public sealed record ChangeExpiryClaimStatusCommand(
    Guid ClaimId, ExpiryClaimAction Action, string? Reason = null, string? Reference = null) : ICommand<Guid>;

public sealed record ExpiryClaimAcceptanceInput(Guid LineId, decimal AcceptedQuantity);

/// <summary>
/// Sent → Accepted. Lines left out of <paramref name="Lines"/> are accepted in full; a line can be accepted
/// for fewer units, or 0. The accepted units go back on a supplier return (debit note) with reason "Expiry",
/// in the same transaction. Returns the supplier return id.
/// </summary>
public sealed record AcceptExpiryClaimCommand(
    Guid ClaimId,
    IReadOnlyList<ExpiryClaimAcceptanceInput>? Lines,
    DateTime ReturnDateUtc,
    string? SupplierInvoiceNumber = null,
    bool ReverseInputVat = true) : ICommand<Guid>;

public sealed record SearchExpiryClaimsQuery(
    string? Status = null,
    Guid? SupplierId = null,
    int PageNumber = 1,
    int PageSize = 20) : IQuery<PagedResponse<ExpiryClaimDto>>;

public sealed record GetExpiryClaimByIdQuery(Guid ClaimId) : IQuery<ExpiryClaimDto>;

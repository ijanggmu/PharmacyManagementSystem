using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Returns;

/// <summary>Mirrors <c>PUT /api/returns/{id}</c> (app/api/returns/[id]/route.ts) — the Next.js PATCH
/// schema also allows updating <paramref name="Reason"/>/<paramref name="Notes"/> without a status
/// change; both are optional here for the same reason.</summary>
public sealed record UpdateReturnStatusCommand(
    Guid ReturnId,
    string? Status = null,
    string? Reason = null,
    string? Notes = null) : ICommand<Guid>;

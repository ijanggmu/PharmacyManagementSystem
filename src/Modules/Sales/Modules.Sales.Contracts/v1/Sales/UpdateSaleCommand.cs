using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>
/// Edits a sale. Only <c>Notes</c> is editable, as in the legacy PATCH. <c>NotesProvided</c> tells an
/// absent <c>notes</c> key (leave unchanged) apart from an explicit null (clear the notes).
/// </summary>
public sealed record UpdateSaleCommand(Guid SaleId, string? Notes, bool NotesProvided) : ICommand<Guid>;

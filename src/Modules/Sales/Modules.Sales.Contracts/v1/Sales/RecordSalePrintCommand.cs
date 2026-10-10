using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>Records that an invoice is being printed and returns its print number, so the printout can
/// carry "COPY OF ORIGINAL — n" on reprints as IRD requires. Format: "thermal-58", "thermal-80" or "a5".</summary>
public sealed record RecordSalePrintCommand(Guid SaleId, string Format) : ICommand<SalePrintResultDto>;

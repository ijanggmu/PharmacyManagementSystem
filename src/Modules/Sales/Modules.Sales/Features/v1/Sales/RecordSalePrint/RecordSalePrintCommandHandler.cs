using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.RecordSalePrint;

/// <summary>
/// Appends a <see cref="SalePrint"/> row. The sale row is locked first so two tills reprinting the same
/// invoice at once get consecutive print numbers (the (SaleId, PrintNumber) unique index backs this up).
/// Works on IRD-locked sales — printing doesn't modify them (they always already carry a number).
///
/// A sale recorded before sequential numbering has no invoice number; a printed invoice must have one,
/// so the first print issues the next number in that sale's own fiscal year for its branch — the same
/// rule as sending it to IRD (SendIrdInvoiceCommandHandler) — in the same transaction as the print row.
/// </summary>
public sealed class RecordSalePrintCommandHandler(
    SalesDbContext dbContext,
    ICurrentUser currentUser,
    IInvoiceNumberService invoiceNumbers,
    ICurrentBranch currentBranch)
    : ICommandHandler<RecordSalePrintCommand, SalePrintResultDto>
{
    public async ValueTask<SalePrintResultDto> Handle(RecordSalePrintCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var header = await dbContext.Sales
            .AsNoTracking()
            .Where(s => s.Id == command.SaleId)
            .Select(s => new { s.BranchId, s.Status, s.InvoiceNumber })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(header.BranchId, $"Sale {command.SaleId} not found.", cancellationToken)
            .ConfigureAwait(false);

        if (header.Status != SaleStatus.Completed)
        {
            throw new CustomException(
                "Only a completed sale has an invoice to print.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // Branch code / prefix are cross-module reads — resolved before the transaction opens.
        var numberContext = header.InvoiceNumber is null
            ? await invoiceNumbers.ResolveContextAsync(header.BranchId, cancellationToken).ConfigureAwait(false)
            : null;

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            async ct =>
            {
                await SalesTransaction.LockSaleRowAsync(dbContext, command.SaleId, ct).ConfigureAwait(false);

                // Tracked load inside the transaction (a retry clears the change tracker).
                var sale = await dbContext.Sales
                    .FirstAsync(s => s.Id == command.SaleId, ct)
                    .ConfigureAwait(false);

                if (sale.InvoiceNumber is null && numberContext is not null)
                {
                    int fiscalYear = NepalFiscalYear.StartYearFor(sale.SaleDateUtc);
                    int sequence = await invoiceNumbers.ReserveNextAsync(sale.BranchId, fiscalYear, ct).ConfigureAwait(false);
                    sale.AssignInvoice(InvoiceNumberService.Format(numberContext, fiscalYear, sequence), fiscalYear);
                }

                int previous = await dbContext.SalePrints
                    .CountAsync(p => p.SaleId == sale.Id, ct)
                    .ConfigureAwait(false);

                Guid userId = currentUser.GetUserId();
                var print = SalePrint.Record(
                    sale.Id, sale.BranchId, previous + 1, CanonicalFormat(command.Format), userId == Guid.Empty ? null : userId);

                dbContext.SalePrints.Add(print);
                await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);

                return new SalePrintResultDto(sale.Id, print.PrintNumber, print.PrintNumber > 1, print.PrintedAtUtc, sale.InvoiceNumber);
            },
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>The validator's spelling of the format (it matched case-insensitively).</summary>
    private static string CanonicalFormat(string format) =>
        RecordSalePrintCommandValidator.Formats.First(f => string.Equals(f, format.Trim(), StringComparison.OrdinalIgnoreCase));
}

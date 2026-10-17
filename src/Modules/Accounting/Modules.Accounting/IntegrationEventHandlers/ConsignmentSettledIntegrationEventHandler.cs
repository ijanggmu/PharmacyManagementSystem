using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Accounting.IntegrationEventHandlers;

/// <summary>Posts the AP voucher for a consignment settlement: Dr Inventory (net) + Dr Input VAT (the VAT
/// the supplier bills on taxable lots) / Cr Accounts Payable (gross) — the same amount the Suppliers module
/// credits to the supplier's AP subledger. The Dr Inventory restores the cost the sales of those consigned
/// units already credited to Inventory (a real accounting simplification: this system doesn't carry
/// consigned stock off-balance-sheet). A settlement owing nothing (units consigned at no cost) posts no
/// voucher. Idempotent via the posted-voucher unique index.</summary>
public sealed partial class ConsignmentSettledIntegrationEventHandler(
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IMediator mediator,
    ILogger<ConsignmentSettledIntegrationEventHandler> logger)
    : IIntegrationEventHandler<ConsignmentSettledIntegrationEvent>
{
    public async Task HandleAsync(ConsignmentSettledIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        decimal payable = @event.TotalAmount + @event.VatAmount;
        if (payable <= 0)
        {
            // An empty voucher would be rejected and the event dead-lettered; there is simply nothing to post.
            LogNothingToPost(logger, @event.SettlementId, @event.SupplierId);
            return;
        }

        var inventoryAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, ct).ConfigureAwait(false);
        var accountsPayableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, ct).ConfigureAwait(false);

        var lines = new List<PostVoucherLine>();
        if (@event.TotalAmount > 0)
        {
            lines.Add(new PostVoucherLine(inventoryAccountId, "Consigned stock now owned", DebitAmount: @event.TotalAmount, CreditAmount: 0m));
        }

        if (@event.VatAmount > 0)
        {
            var inputVatId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.InputVatRecoverable, ct).ConfigureAwait(false);
            lines.Add(new PostVoucherLine(inputVatId, "Input VAT on consignment settlement", DebitAmount: @event.VatAmount, CreditAmount: 0m));
        }

        lines.Add(new PostVoucherLine(accountsPayableId, "Payable to supplier", DebitAmount: 0m, CreditAmount: payable));

        string supplier = await SupplierNameAsync(@event.SupplierId, ct).ConfigureAwait(false);

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_consignment_settlement",
                ReferenceType: "ConsignmentSettlement",
                ReferenceId: @event.SettlementId,
                Narration: $"Consignment settlement for {supplier}",
                Lines: lines,
                BranchId: @event.BranchId,
                VoucherDateUtc: @event.SettlementDateUtc),
            ct).ConfigureAwait(false);
    }

    /// <summary>The supplier's name for the narration; the id when it can't be looked up (the voucher still posts).</summary>
    private async Task<string> SupplierNameAsync(Guid supplierId, CancellationToken ct)
    {
        try
        {
            var supplier = await mediator.Send(new GetSupplierByIdQuery(supplierId), ct).ConfigureAwait(false);
            return string.IsNullOrWhiteSpace(supplier.Name) ? $"supplier {supplierId}" : supplier.Name;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            LogSupplierNameUnavailable(logger, supplierId, ex);
            return $"supplier {supplierId}";
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Supplier {SupplierId} name unavailable for a consignment voucher narration")]
    private static partial void LogSupplierNameUnavailable(ILogger logger, Guid supplierId, Exception exception);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Consignment settlement {SettlementId} for supplier {SupplierId} owes nothing; no voucher posted")]
    private static partial void LogNothingToPost(ILogger logger, Guid settlementId, Guid supplierId);
}

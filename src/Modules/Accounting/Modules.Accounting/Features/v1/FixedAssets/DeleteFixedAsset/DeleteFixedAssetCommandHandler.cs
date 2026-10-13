using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.DeleteFixedAsset;

/// <summary>
/// Removes an asset entered by mistake: reverses its acquisition voucher (dated now, or the first open day) and deletes
/// the register row in one transaction; a pay-later asset also raises <see cref="ExpenseBillVoidedIntegrationEvent"/> so
/// Suppliers credits the bill back. Refused once depreciation is posted, once it is disposed, or once anything is
/// allocated to its supplier bill.
/// </summary>
public sealed class DeleteFixedAssetCommandHandler(
    AccountingDbContext dbContext,
    VoucherPostingService voucherPostingService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IMediator mediator,
    IOutboxWriter outbox) : ICommandHandler<DeleteFixedAssetCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeleteFixedAssetCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var asset = await dbContext.FixedAssets
            .FirstOrDefaultAsync(a => a.Id == command.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Fixed asset {command.Id} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(asset.BranchId, $"Fixed asset {command.Id} not found.", cancellationToken).ConfigureAwait(false);

        if (asset.IsDisposed)
        {
            throw Conflict("A disposed asset can't be deleted — its disposal is on the books.");
        }

        if (await dbContext.FixedAssetDepreciationEntries.AnyAsync(e => e.AssetId == asset.Id, cancellationToken).ConfigureAwait(false))
        {
            throw Conflict("Depreciation has been posted for this asset, so it can't be deleted. Reverse its depreciation runs first, or dispose of it.");
        }

        if (asset.SupplierId is { } supplierId)
        {
            var bills = await mediator.Send(new GetSupplierOpenBillsQuery(supplierId, OnlyOpen: false), cancellationToken).ConfigureAwait(false);
            var bill = bills.Bills.FirstOrDefault(b =>
                string.Equals(b.ReferenceType, ExpenseBillReference.ReferenceType, StringComparison.Ordinal) && b.ReferenceId == asset.Id);
            if (bill is { } settled && settled.Paid + settled.Credited > 0)
            {
                throw Conflict(
                    $"This asset's supplier bill has already been paid (fully or in part) ({settled.Paid + settled.Credited:0.00} of " +
                    $"{settled.Amount:0.00}), so it can't be deleted. Dispose of the asset or settle the difference with the supplier instead.");
            }
        }

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            DateTime deletedAtUtc = DateTime.UtcNow;
            var voucherId = await voucherPostingService
                .FindPostedVoucherIdAsync(FixedAssetVouchers.ReferenceType, asset.Id, cancellationToken)
                .ConfigureAwait(false);
            if (voucherId is { } id)
            {
                string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
                await voucherPostingService
                    .ReverseOwnedSystemVoucherAsync(id, actor, deletedAtUtc, "fixed asset deleted", cancellationToken)
                    .ConfigureAwait(false);
            }

            dbContext.FixedAssets.Remove(asset);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            if (asset.SupplierId is { } owedTo)
            {
                await outbox.AddAsync(new ExpenseBillVoidedIntegrationEvent(
                    Id: Guid.NewGuid(),
                    OccurredOnUtc: deletedAtUtc,
                    TenantId: currentUser.GetTenant(),
                    CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                    Source: "Accounting",
                    ExpenseId: asset.Id,
                    SupplierId: owedTo,
                    Amount: asset.Cost + asset.VatAmount,
                    VoidedAtUtc: deletedAtUtc,
                    Reason: "fixed asset deleted",
                    BillNumber: asset.BillNumber,
                    BranchId: asset.BranchId), cancellationToken).ConfigureAwait(false);
            }

            return asset.Id;
        }, cancellationToken).ConfigureAwait(false);
    }

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}

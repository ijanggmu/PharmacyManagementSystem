using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Expenses;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.CreateFixedAsset;

/// <summary>
/// Adds an asset to the register and posts its acquisition voucher in one transaction, so the register and the Fixed
/// Assets control account never disagree. A date in a locked period is refused.
/// <list type="bullet">
/// <item>Paid now — <c>system_asset_acquisition</c> (JV): Dr Fixed Assets (cost) + Dr Input VAT / Cr the payment method's
/// money account.</item>
/// <item>Supplier bill — same voucher with Cr Accounts Payable; <see cref="ExpenseBillRecordedIntegrationEvent"/> goes
/// out through the outbox in the same transaction (reference <c>Expense</c> / the asset id, which Suppliers treats as any
/// other pay-later bill), so the bill lands on the supplier's AP ledger and is paid through supplier payments.</item>
/// <item>Opening — <c>system_asset_opening</c> (OB), dated the go-live date: Dr Fixed Assets / Cr Accumulated
/// Depreciation + Cr Owner's Equity.</item>
/// </list>
/// </summary>
public sealed class CreateFixedAssetCommandHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    AccountingPostingLockService postingLockService,
    IMediator mediator,
    IOutboxWriter outbox) : ICommandHandler<CreateFixedAssetCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateFixedAssetCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var source = FixedAssetVouchers.ParseSource(command.Source)
            ?? throw new CustomException("Unknown acquisition source.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        var method = FixedAssetVouchers.ParseMethod(command.DepreciationMethod)
            ?? throw new CustomException("Unknown depreciation method.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

        DateTime voucherDateUtc = FixedAsset.AcquisitionVoucherDate(source, command.AcquisitionDateUtc, command.DepreciationStartDateUtc);
        await postingLockService.AssertPostingOpenAsync(voucherDateUtc, cancellationToken).ConfigureAwait(false);

        // A caller confined to a branch records assets for that branch; one who sees every branch may pick it.
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(command.BranchId, cancellationToken).ConfigureAwait(false)
            ?? await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        string? vendorName = command.VendorName;
        string? supplierVatNumber = command.SupplierVatNumber;
        if (source == FixedAssetAcquisitionSource.Supplier && command.SupplierId is { } supplierId)
        {
            var supplier = await mediator.Send(new GetSupplierByIdQuery(supplierId), cancellationToken).ConfigureAwait(false);
            if (!supplier.IsActive || supplier.DeletedOnUtc is not null)
            {
                throw new CustomException(
                    $"Supplier {supplier.Name} is inactive — choose an active supplier or record the asset as paid.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            vendorName = supplier.Name;
            if (string.IsNullOrWhiteSpace(supplierVatNumber))
            {
                supplierVatNumber = supplier.TaxId;
            }
        }

        decimal vatAmount = source == FixedAssetAcquisitionSource.Opening ? 0m : command.VatAmount;
        ExpensePosting.EnsureVatBillDetails(vatAmount, command.Amount, supplierVatNumber, command.BillNumber);

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
        var asset = FixedAsset.Create(
            command.Name, command.Category, command.AcquisitionDateUtc, source, command.Amount - vatAmount, vatAmount, actor, branchId,
            command.PaymentMethod, command.SupplierId, vendorName, supplierVatNumber, command.BillNumber,
            command.OpeningAccumulatedDepreciation, command.DepreciationStartDateUtc, command.OpeningTaxWrittenDownValue);
        asset.Describe(command.Name, command.Category, command.AssetTag, command.Location, command.Notes);
        asset.SetDepreciationTerms(
            command.ResidualValue, method, command.UsefulLifeMonths, command.RatePercent, command.TaxPool, command.TaxUsefulLifeYears);

        // Accounts first: a system account created on first use is saved on its own, before the asset.
        var fixedAssetsId = await FixedAssetAccounts.FixedAssetsAsync(dbContext, cancellationToken).ConfigureAwait(false);
        var lines = await BuildLinesAsync(asset, fixedAssetsId, cancellationToken).ConfigureAwait(false);

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            dbContext.FixedAssets.Add(asset);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            await voucherPostingService.PostSystemVoucherAsync(
                new PostVoucherRequest(
                    VoucherType: asset.IsOpening ? FixedAssetVouchers.OpeningVoucherType : FixedAssetVouchers.AcquisitionVoucherType,
                    ReferenceType: FixedAssetVouchers.ReferenceType,
                    ReferenceId: asset.Id,
                    Narration: Narration(asset),
                    Lines: lines,
                    BranchId: branchId,
                    VoucherDateUtc: voucherDateUtc),
                cancellationToken).ConfigureAwait(false);

            if (asset.SupplierId is { } owedTo)
            {
                await outbox.AddAsync(new ExpenseBillRecordedIntegrationEvent(
                    Id: Guid.NewGuid(),
                    OccurredOnUtc: DateTime.UtcNow,
                    TenantId: currentUser.GetTenant(),
                    CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                    Source: "Accounting",
                    ExpenseId: asset.Id,
                    SupplierId: owedTo,
                    Amount: asset.Cost + asset.VatAmount,
                    ExpenseDateUtc: asset.AcquisitionDateUtc,
                    Category: "Fixed asset — " + asset.Name,
                    BillNumber: asset.BillNumber,
                    Description: asset.Category,
                    BranchId: branchId), cancellationToken).ConfigureAwait(false);
            }

            return asset.Id;
        }, cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<IReadOnlyList<PostVoucherLine>> BuildLinesAsync(FixedAsset asset, Guid fixedAssetsId, CancellationToken cancellationToken)
    {
        if (asset.IsOpening)
        {
            var accumulatedId = await FixedAssetAccounts.AccumulatedDepreciationAsync(dbContext, cancellationToken).ConfigureAwait(false);
            var equityId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, cancellationToken).ConfigureAwait(false);
            return FixedAssetPosting.OpeningLines(asset, fixedAssetsId, accumulatedId, equityId);
        }

        Guid? inputVatId = asset.VatAmount > 0m
            ? await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.InputVatRecoverable, cancellationToken).ConfigureAwait(false)
            : null;

        if (asset.Source == FixedAssetAcquisitionSource.Supplier)
        {
            var payableId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, cancellationToken).ConfigureAwait(false);
            string payable = asset.VendorName is null ? "Payable" : "Payable to " + asset.VendorName;
            return FixedAssetPosting.AcquisitionLines(asset, fixedAssetsId, inputVatId, payableId, payable);
        }

        var moneyId = await paymentAccounts.ResolveAccountIdAsync(asset.PaymentMethod, cancellationToken).ConfigureAwait(false);
        string paid = PaymentMethodAccounts.IsCash(asset.PaymentMethod) ? "Paid in cash" : "Paid from bank";
        return FixedAssetPosting.AcquisitionLines(asset, fixedAssetsId, inputVatId, moneyId, paid);
    }

    private static string Narration(FixedAsset asset)
    {
        string text = asset.IsOpening
            ? $"Opening fixed asset: {asset.Name} ({asset.Category})"
            : $"Fixed asset acquired: {asset.Name} ({asset.Category})";
        if (asset.BillNumber is not null)
        {
            text += " — bill " + asset.BillNumber;
        }

        if (asset.VendorName is not null)
        {
            text += " from " + asset.VendorName;
        }

        return text.Length <= 1024 ? text : text[..1024];
    }
}

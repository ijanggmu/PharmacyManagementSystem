using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.FixedAssets;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets.DisposeFixedAsset;

/// <summary>
/// Sells or writes off an asset and posts the disposal (<c>system_asset_disposal</c>, JV, reference
/// <c>FixedAssetDisposal</c> / asset id) in one transaction with the register update:
/// Dr Accumulated Depreciation (opening + every posted month) + Dr money account (proceeds + output VAT) + Dr Loss on
/// Disposal / Cr Fixed Assets (cost) + Cr VAT Payable (output VAT on a sale by a VAT-registered seller) + Cr Gain on
/// Disposal. Gain/loss = net proceeds − (cost − accumulated depreciation); the VAT is owed to IRD, not income, and the
/// VAT return reports it with the taxable sales (<c>GetVatReturnQueryHandler</c>).
/// <para>Depreciation is charged up to the month before the disposal month, so every such month must be posted first
/// (the 409 names the earliest one). A date in a locked period is refused.</para>
/// </summary>
public sealed class DisposeFixedAssetCommandHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IPaymentMethodAccountResolver paymentAccounts,
    IAccountingAccountResolver accountResolver,
    ICurrentBranch currentBranch,
    AccountingPostingLockService postingLockService) : ICommandHandler<DisposeFixedAssetCommand, Guid>
{
    public async ValueTask<Guid> Handle(DisposeFixedAssetCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var kind = FixedAssetVouchers.ParseDisposalKind(command.Kind)
            ?? throw new CustomException("Unknown disposal kind.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

        var asset = await dbContext.FixedAssets
            .FirstOrDefaultAsync(a => a.Id == command.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Fixed asset {command.Id} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(asset.BranchId, $"Fixed asset {command.Id} not found.", cancellationToken).ConfigureAwait(false);

        if (asset.IsDisposed)
        {
            throw Conflict("This asset has already been disposed.");
        }

        if (NepalDate.FromUtc(command.DisposalDateUtc) < NepalDate.FromUtc(asset.AcquisitionDateUtc))
        {
            throw new CustomException("The disposal date can't be before the acquisition date.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        await postingLockService.AssertPostingOpenAsync(command.DisposalDateUtc, cancellationToken).ConfigureAwait(false);

        var posted = (await FixedAssetRegister.LoadPostedAsync(dbContext, [asset.Id], cancellationToken).ConfigureAwait(false)).For(asset.Id);
        int disposalPeriod = FiscalPeriod.OfUtc(command.DisposalDateUtc).Index;
        if (posted.Periods.Any(p => p >= disposalPeriod))
        {
            throw Conflict(
                $"Depreciation is already posted for {FiscalPeriod.FromIndex(posted.Periods.Max()).Label}, on or after the disposal month. " +
                "Reverse that depreciation run first, or dispose of the asset on a later date.");
        }

        var unposted = DepreciationPlanner.UnpostedBefore(asset, posted, disposalPeriod);
        if (unposted.Count > 0)
        {
            var first = FiscalPeriod.FromIndex(unposted[0].Period);
            var last = FiscalPeriod.FromIndex(unposted[^1].Period);
            throw Conflict(
                $"Depreciation for {first.Label}{(unposted.Count > 1 ? " – " + last.Label : string.Empty)} is not posted yet. " +
                "Run depreciation up to the month before the disposal first, so the gain or loss is worked out on the right book value.");
        }

        decimal proceeds = kind == FixedAssetDisposalKind.WriteOff ? 0m : command.Proceeds;
        decimal vatAmount = kind == FixedAssetDisposalKind.WriteOff ? 0m : Math.Round(command.VatAmount, 2, MidpointRounding.AwayFromZero);
        decimal accumulated = asset.OpeningAccumulatedDepreciation + posted.Total;

        var fixedAssetsId = await FixedAssetAccounts.FixedAssetsAsync(dbContext, cancellationToken).ConfigureAwait(false);
        var accumulatedId = await FixedAssetAccounts.AccumulatedDepreciationAsync(dbContext, cancellationToken).ConfigureAwait(false);
        var gainId = await FixedAssetAccounts.GainOnDisposalAsync(dbContext, cancellationToken).ConfigureAwait(false);
        var lossId = await FixedAssetAccounts.LossOnDisposalAsync(dbContext, cancellationToken).ConfigureAwait(false);
        Guid? vatPayableId = vatAmount > 0m
            ? await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.VatPayable, cancellationToken).ConfigureAwait(false)
            : null;
        Guid? moneyId = proceeds + vatAmount > 0m
            ? await paymentAccounts.ResolveAccountIdAsync(command.PaymentMethod, cancellationToken).ConfigureAwait(false)
            : null;

        asset.RecordDisposal(command.DisposalDateUtc, kind, proceeds, command.PaymentMethod, accumulated, command.Notes, vatAmount);
        var lines = FixedAssetPosting.DisposalLines(
            asset, accumulated, proceeds, fixedAssetsId, accumulatedId, moneyId, gainId, lossId, vatAmount, vatPayableId);

        string what = kind == FixedAssetDisposalKind.Sale ? "sold" : "written off";
        string narration = $"Fixed asset {what}: {asset.Name} ({asset.Category})";
        if (!string.IsNullOrWhiteSpace(command.Notes))
        {
            narration += " — " + command.Notes.Trim();
        }

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return await voucherPostingService.PostSystemVoucherAsync(
                new PostVoucherRequest(
                    VoucherType: FixedAssetVouchers.DisposalVoucherType,
                    ReferenceType: FixedAssetVouchers.DisposalReferenceType,
                    ReferenceId: asset.Id,
                    Narration: narration.Length <= 1024 ? narration : narration[..1024],
                    Lines: lines,
                    BranchId: asset.BranchId,
                    VoucherDateUtc: command.DisposalDateUtc),
                cancellationToken).ConfigureAwait(false);
        }, cancellationToken).ConfigureAwait(false);
    }

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}

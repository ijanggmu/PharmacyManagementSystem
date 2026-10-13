using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The fixed asset system accounts — Fixed Assets 1550, Accumulated Depreciation 1590 (contra-asset), Depreciation
/// Expense 5350, Gain on Disposal 4950 and Loss on Disposal 5950 — seeded by <c>AccountingDbInitializer</c>. A tenant whose
/// seed has not run since they were added gets each created on first use under its root head, like TDS Payable
/// (<see cref="TdsPayableAccount"/>): saved on its own before the voucher (posting checks accounts against the database);
/// a concurrent creation fails on the unique code and the retried request finds it.
/// </summary>
internal static class FixedAssetAccounts
{
    public const string FixedAssetsName = "Fixed Assets";
    public const string AccumulatedDepreciationName = "Accumulated Depreciation";
    public const string DepreciationExpenseName = "Depreciation Expense";
    public const string GainOnDisposalName = "Gain on Disposal of Fixed Assets";
    public const string LossOnDisposalName = "Loss on Disposal of Fixed Assets";

    public static ValueTask<Guid> FixedAssetsAsync(AccountingDbContext dbContext, CancellationToken cancellationToken) =>
        GetOrCreateAsync(dbContext, AccountingSystemAccountCodes.FixedAssets, FixedAssetsName, AccountingAccountType.Asset, cancellationToken);

    public static ValueTask<Guid> AccumulatedDepreciationAsync(AccountingDbContext dbContext, CancellationToken cancellationToken) =>
        GetOrCreateAsync(
            dbContext, AccountingSystemAccountCodes.AccumulatedDepreciation, AccumulatedDepreciationName, AccountingAccountType.Asset, cancellationToken);

    public static ValueTask<Guid> DepreciationExpenseAsync(AccountingDbContext dbContext, CancellationToken cancellationToken) =>
        GetOrCreateAsync(
            dbContext, AccountingSystemAccountCodes.DepreciationExpense, DepreciationExpenseName, AccountingAccountType.Expense, cancellationToken);

    public static ValueTask<Guid> GainOnDisposalAsync(AccountingDbContext dbContext, CancellationToken cancellationToken) =>
        GetOrCreateAsync(
            dbContext, AccountingSystemAccountCodes.GainOnAssetDisposal, GainOnDisposalName, AccountingAccountType.Revenue, cancellationToken);

    public static ValueTask<Guid> LossOnDisposalAsync(AccountingDbContext dbContext, CancellationToken cancellationToken) =>
        GetOrCreateAsync(
            dbContext, AccountingSystemAccountCodes.LossOnAssetDisposal, LossOnDisposalName, AccountingAccountType.Expense, cancellationToken);

    private static async ValueTask<Guid> GetOrCreateAsync(
        AccountingDbContext dbContext, string code, string name, AccountingAccountType type, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var existing = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Code == code)
            .Select(a => new { a.Id, a.IsSystem })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (existing is { IsSystem: true })
        {
            return existing.Id;
        }

        if (existing is not null)
        {
            throw new CustomException(
                $"Account code {code} is used by a user-created account, so the system {name} account can't be created. " +
                "Change that account's code, then retry.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        string rootCode = AccountingAccount.RootHeads[type].Code;
        Guid? root = await dbContext.Accounts
            .Where(a => a.ParentId == null && a.IsSystem && a.Code == rootCode)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        var account = AccountingAccount.Create(code, name, type, isSystem: true, parentId: root);
        dbContext.Accounts.Add(account);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return account.Id;
    }
}

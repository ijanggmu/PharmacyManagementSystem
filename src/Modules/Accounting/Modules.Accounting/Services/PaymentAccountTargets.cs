using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Which accounts money can be pointed at — a payment method's mapping, a deposit's target, a
/// reconciliation's account: an active leaf asset account in the cash &amp; bank block (<c>10xx</c>, see
/// <see cref="CashBankAccounts"/>). Insurance is the exception: an insurance tender is money still owed by
/// the insurer, so it may map to any active leaf asset (Insurance Receivable 1190 by default).
/// </summary>
internal static class PaymentAccountTargets
{
    public static bool IsCashBankCode(string code) =>
        code.StartsWith(CashBankAccounts.CodePrefix, StringComparison.Ordinal);

    /// <summary>Loads the account and throws a 400 unless it can take this method's money.</summary>
    public static async Task<AccountingAccount> EnsureValidForMethodAsync(
        AccountingDbContext dbContext, string method, Guid accountId, CancellationToken cancellationToken = default)
    {
        bool anyAsset = string.Equals(
            PaymentMethodAccounts.Normalize(method), PaymentMethodAccounts.Insurance, StringComparison.Ordinal);
        return await EnsureValidAsync(dbContext, accountId, anyAsset, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Loads the account and throws a 400 unless it is an active leaf cash/bank account.</summary>
    public static Task<AccountingAccount> EnsureCashBankAsync(
        AccountingDbContext dbContext, Guid accountId, CancellationToken cancellationToken = default) =>
        EnsureValidAsync(dbContext, accountId, anyAsset: false, cancellationToken);

    private static async Task<AccountingAccount> EnsureValidAsync(
        AccountingDbContext dbContext, Guid accountId, bool anyAsset, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var account = await dbContext.Accounts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == accountId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Account {accountId} not found.");

        string label = $"Account {account.Code} {account.Name}";
        if (account.AccountType != AccountingAccountType.Asset)
        {
            throw BadRequest($"{label} isn't an asset account — money can only be held in an asset account.");
        }

        if (!anyAsset && !IsCashBankCode(account.Code))
        {
            throw BadRequest($"{label} isn't a cash or bank account. Pick an account in the 10xx cash & bank block.");
        }

        if (!account.IsActive)
        {
            throw BadRequest($"{label} is inactive.");
        }

        bool isGroup = account.IsRootHead || await dbContext.Accounts
            .AnyAsync(a => a.ParentId == account.Id, cancellationToken)
            .ConfigureAwait(false);
        if (isGroup)
        {
            throw BadRequest($"{label} is a group account — pick one of its sub-accounts instead.");
        }

        return account;
    }

    private static CustomException BadRequest(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
}

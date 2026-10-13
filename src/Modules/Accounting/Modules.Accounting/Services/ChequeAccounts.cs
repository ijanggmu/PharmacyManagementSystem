using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The system accounts post-dated cheques wait in until they clear: Cheques in Hand
/// (<see cref="AccountingSystemAccountCodes.ChequesInHand"/>, an asset) for cheques received and Cheques Issued
/// (<see cref="AccountingSystemAccountCodes.ChequesIssued"/>, a liability) for cheques given to suppliers. Both are
/// seeded by <c>AccountingDbInitializer</c>; a tenant whose seed has not run since gets them created on first use
/// under the type's root head (the <see cref="TdsPayableAccount"/> pattern). A new account is saved on its own
/// before the voucher (posting checks its accounts against the database); a concurrent creation fails on the unique
/// code and the retried delivery finds the account.
/// </summary>
internal static class ChequeAccounts
{
    public const string ChequesInHandName = "Cheques in Hand (PDC Receivable)";
    public const string ChequesIssuedName = "Cheques Issued (PDC Payable)";

    /// <summary>The account a cheque of <paramref name="direction"/> waits in until it clears.</summary>
    public static ValueTask<Guid> HoldingAccountAsync(
        AccountingDbContext dbContext, ChequeDirection direction, CancellationToken cancellationToken) =>
        direction == ChequeDirection.Received
            ? GetOrCreateAsync(dbContext, AccountingSystemAccountCodes.ChequesInHand, ChequesInHandName, AccountingAccountType.Asset, cancellationToken)
            : GetOrCreateAsync(dbContext, AccountingSystemAccountCodes.ChequesIssued, ChequesIssuedName, AccountingAccountType.Liability, cancellationToken);

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

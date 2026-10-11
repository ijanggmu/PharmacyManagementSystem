namespace FSH.Modules.Accounting.Contracts.Services;

/// <summary>
/// Resolves a chart-of-accounts <c>Code</c> (see <see cref="AccountingSystemAccountCodes"/>) to its
/// <c>AccountingAccount.Id</c> — the second half, alongside <see cref="IVoucherPostingService"/>, of
/// the cross-module surface a caller needs to build a <see cref="PostVoucherRequest"/> without a
/// reference to the Accounting runtime project.
/// </summary>
public interface IAccountingAccountResolver
{
    /// <summary>Throws <c>NotFoundException</c> if no account has this code.</summary>
    ValueTask<Guid> ResolveByCodeAsync(string code, CancellationToken cancellationToken = default);
}

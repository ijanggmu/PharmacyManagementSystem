using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.PaymentAccounts;

/// <summary>Builds the full method → account list (mapped rows plus built-in defaults) for GET and PUT.</summary>
internal static class PaymentMethodAccountsView
{
    public static async Task<IReadOnlyList<PaymentMethodAccountDto>> BuildAsync(
        AccountingDbContext dbContext, CancellationToken cancellationToken)
    {
        var mapped = await dbContext.PaymentMethodAccounts
            .AsNoTracking()
            .ToDictionaryAsync(m => m.Method, m => m.AccountId, StringComparer.Ordinal, cancellationToken)
            .ConfigureAwait(false);

        var defaultCodes = PaymentMethodAccounts.Methods.Select(PaymentMethodAccounts.DefaultAccountCodeFor).Distinct().ToList();
        var mappedIds = mapped.Values.Distinct().ToList();
        var accounts = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => mappedIds.Contains(a.Id) || defaultCodes.Contains(a.Code))
            .Select(a => new { a.Id, a.Code, a.Name })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var result = new List<PaymentMethodAccountDto>(PaymentMethodAccounts.Methods.Count);
        foreach (string method in PaymentMethodAccounts.Methods)
        {
            string defaultCode = PaymentMethodAccounts.DefaultAccountCodeFor(method);
            bool isDefault = !mapped.TryGetValue(method, out Guid accountId);
            var account = isDefault
                ? accounts.FirstOrDefault(a => a.Code == defaultCode)
                : accounts.FirstOrDefault(a => a.Id == accountId);

            result.Add(new PaymentMethodAccountDto(
                method,
                isDefault ? account?.Id : accountId,
                account?.Code,
                account?.Name,
                isDefault,
                defaultCode));
        }

        return result;
    }
}

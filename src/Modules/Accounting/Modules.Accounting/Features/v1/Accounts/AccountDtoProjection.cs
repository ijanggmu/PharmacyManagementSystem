using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.Accounts;

/// <summary>Projects accounts to <see cref="AccountingAccountDto"/> with their tree flags computed in the same query.</summary>
internal static class AccountDtoProjection
{
    public static IQueryable<AccountingAccountDto> ToDto(this IQueryable<AccountingAccount> accounts, AccountingDbContext dbContext) =>
        accounts.Select(a => new AccountingAccountDto(
            a.Id,
            a.Code,
            a.Name,
            a.AccountType.ToString(),
            a.IsSystem,
            a.IsActive,
            a.CreatedAtUtc,
            a.UpdatedAtUtc,
            a.ParentId,
            dbContext.Accounts.Any(c => c.ParentId == a.Id),
            dbContext.VoucherLines.Any(l => l.AccountId == a.Id),
            a.ParentId == null && a.IsSystem && a.Code.Length == 1));
}

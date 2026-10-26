using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The payroll system accounts — Salary Expense 5810, Employer SSF Expense 5820, Salaries Payable 2810, SSF Payable 2820,
/// Salary TDS Payable 2155, CIT Payable 2830 and Other Payroll Deductions Payable 2840 — seeded by
/// <c>AccountingDbInitializer</c>. A tenant whose seed has not run since they were added gets each created on first use
/// under its root head, like <see cref="FixedAssetAccounts"/>: saved on its own before the voucher (posting checks accounts
/// against the database); a concurrent creation fails on the unique code and the retried event finds it. A user-created
/// account already holding one of the codes is refused with 409 rather than silently posted to.
/// </summary>
internal static class PayrollAccounts
{
    public const string SalaryExpenseName = "Salary Expense";
    public const string EmployerSsfExpenseName = "Employer SSF Expense";
    public const string SalariesPayableName = "Salaries Payable";
    public const string SsfPayableName = "SSF Payable";
    public const string SalaryTdsPayableName = "Salary TDS Payable";
    public const string CitPayableName = "CIT Payable";
    public const string PayrollDeductionsPayableName = "Other Payroll Deductions Payable";

    /// <summary>Every payroll account (code, name, type) — the seed list.</summary>
    public static IReadOnlyList<(string Code, string Name, AccountingAccountType Type)> All { get; } =
    [
        (AccountingSystemAccountCodes.SalaryTdsPayable, SalaryTdsPayableName, AccountingAccountType.Liability),
        (AccountingSystemAccountCodes.SalariesPayable, SalariesPayableName, AccountingAccountType.Liability),
        (AccountingSystemAccountCodes.SsfPayable, SsfPayableName, AccountingAccountType.Liability),
        (AccountingSystemAccountCodes.CitPayable, CitPayableName, AccountingAccountType.Liability),
        (AccountingSystemAccountCodes.PayrollDeductionsPayable, PayrollDeductionsPayableName, AccountingAccountType.Liability),
        (AccountingSystemAccountCodes.SalaryExpense, SalaryExpenseName, AccountingAccountType.Expense),
        (AccountingSystemAccountCodes.EmployerSsfExpense, EmployerSsfExpenseName, AccountingAccountType.Expense),
    ];

    public static ValueTask<Guid> GetOrCreateAsync(AccountingDbContext dbContext, string code, CancellationToken cancellationToken)
    {
        var (_, name, type) = All.First(a => a.Code == code);
        return GetOrCreateAsync(dbContext, code, name, type, cancellationToken);
    }

    /// <summary>Finds the system account <paramref name="code"/>, or creates it under its root head. Shared with the other
    /// system accounts created on first use (<see cref="AppointmentAccounts"/>).</summary>
    internal static async ValueTask<Guid> GetOrCreateAsync(
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

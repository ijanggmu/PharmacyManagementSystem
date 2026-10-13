using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Reference.Contracts.v1.Settings;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Expenses;

/// <summary>
/// The rules shared by recording and editing an expense: which ledger account takes the cost, how much of the bill
/// is input VAT, how much TDS is withheld, and the voucher lines — Dr expense account (net) + Dr Input VAT Recoverable
/// (VAT) / Cr the money account (paid now) or Accounts Payable (pay later) for the gross amount less TDS, and
/// Cr TDS Payable for the TDS.
/// <para>Nepal rule: TDS is withheld on the payment excluding VAT (the VAT is not the vendor's income), so the TDS
/// base is the expense's net amount.</para>
/// </summary>
public static class ExpensePosting
{
    /// <summary>Expense-type accounts an expense may not be booked to: they belong to other flows.</summary>
    private static readonly HashSet<string> ReservedCodes = new(StringComparer.Ordinal)
    {
        AccountingSystemAccountCodes.CostOfGoodsSold,
        AccountingSystemAccountCodes.RoundingOff,
    };

    /// <summary>The account the net cost is booked to: the requested one, which must be an active Expense-type ledger
    /// (leaf) account, or General Expenses (5100) when none is given.</summary>
    public static async ValueTask<Guid> ResolveExpenseAccountAsync(
        AccountingDbContext dbContext, IAccountingAccountResolver accountResolver, Guid? requestedAccountId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(accountResolver);

        if (requestedAccountId is not { } accountId)
        {
            return await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.GeneralExpenses, cancellationToken).ConfigureAwait(false);
        }

        var account = await dbContext.Accounts
            .AsNoTracking()
            .Where(a => a.Id == accountId)
            .Select(a => new
            {
                a.Code,
                a.Name,
                a.AccountType,
                a.IsActive,
                IsRootHead = a.ParentId == null && a.IsSystem && a.Code.Length == 1,
                HasChildren = dbContext.Accounts.Any(c => c.ParentId == a.Id),
            })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new CustomException("The chosen expense account does not exist.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

        string? problem = account switch
        {
            { AccountType: not AccountingAccountType.Expense } => $"Account {account.Code} {account.Name} is not an expense account.",
            { IsActive: false } => $"Account {account.Code} {account.Name} is inactive.",
            { IsRootHead: true } or { HasChildren: true } => $"Account {account.Code} {account.Name} is a group account — choose one of its sub-accounts.",
            _ when ReservedCodes.Contains(account.Code) => $"Account {account.Code} {account.Name} is reserved for system postings — choose another expense account.",
            _ => null,
        };
        if (problem is not null)
        {
            throw new CustomException(problem, (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return accountId;
    }

    /// <summary>The input VAT inside <paramref name="amount"/>: the explicit <paramref name="vatAmount"/> when given;
    /// else, when the amount includes VAT, the tenant VAT rate's share of it (amount × rate / (100 + rate)); else 0.</summary>
    public static async ValueTask<decimal> ResolveVatAsync(
        decimal amount, decimal? vatAmount, bool amountIncludesVat, IMediator mediator, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(mediator);

        if (vatAmount is { } explicitVat)
        {
            return Math.Round(explicitVat, 2, MidpointRounding.AwayFromZero);
        }

        if (!amountIncludesVat)
        {
            return 0m;
        }

        decimal ratePercent = (await mediator.Send(new GetPharmacySettingsQuery(), cancellationToken).ConfigureAwait(false)).VatRatePercent;
        if (ratePercent <= 0)
        {
            throw new CustomException(
                "The VAT rate is not set in pharmacy settings — enter the VAT amount from the bill instead.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return VatIncluded(amount, ratePercent);
    }

    /// <summary>The VAT part of a VAT-inclusive amount at <paramref name="ratePercent"/>, to the paisa.</summary>
    public static decimal VatIncluded(decimal grossAmount, decimal ratePercent) =>
        Math.Round(grossAmount * ratePercent / (100m + ratePercent), 2, MidpointRounding.AwayFromZero);

    /// <summary>Checks a VAT bill carries what an input VAT claim needs (the seller's VAT number and the bill number).</summary>
    public static void EnsureVatBillDetails(decimal vatAmount, decimal amount, string? supplierVatNumber, string? billNumber)
    {
        if (vatAmount <= 0)
        {
            return;
        }

        if (vatAmount >= amount)
        {
            throw new CustomException("VAT must be less than the expense amount.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (string.IsNullOrWhiteSpace(supplierVatNumber) || string.IsNullOrWhiteSpace(billNumber))
        {
            throw new CustomException(
                "A VAT bill needs the seller's VAT / PAN number and the bill number to claim the input VAT.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }
    }

    /// <summary>The account credited with the gross amount: Accounts Payable for a pay-later expense, else the money
    /// account for its payment method (<see cref="PaymentMethodAccounts"/>).</summary>
    public static ValueTask<Guid> ResolveCreditAccountAsync(
        Expense expense, IAccountingAccountResolver accountResolver, IPaymentMethodAccountResolver paymentAccounts,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(expense);
        ArgumentNullException.ThrowIfNull(accountResolver);
        ArgumentNullException.ThrowIfNull(paymentAccounts);

        // Paid now: the tenant's account for the payment method (cash drawer, a bank, a wallet).
        return expense.IsOnCredit
            ? accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, cancellationToken)
            : paymentAccounts.ResolveAccountIdAsync(expense.PaymentMethod, cancellationToken);
    }

    /// <summary>Resolves Input VAT Recoverable only when the expense carries VAT.</summary>
    public static async ValueTask<Guid?> ResolveInputVatAccountAsync(
        Expense expense, IAccountingAccountResolver accountResolver, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(expense);
        ArgumentNullException.ThrowIfNull(accountResolver);

        return expense.VatAmount > 0
            ? await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.InputVatRecoverable, cancellationToken).ConfigureAwait(false)
            : null;
    }

    /// <summary>The TDS withheld per the command's TDS fields, on the amount excluding VAT (null without a category).</summary>
    public static Task<TdsWithholding?> ResolveTdsAsync(
        AccountingDbContext dbContext, decimal amount, decimal vatAmount, string? tdsCategory, decimal? tdsRatePercent,
        decimal? tdsAmount, CancellationToken cancellationToken) =>
        TdsCategoryCatalog.ResolveAsync(dbContext, tdsCategory, tdsRatePercent, tdsAmount, amount - vatAmount, cancellationToken);

    /// <summary>Resolves (creating it on first use) TDS Payable only when TDS is withheld.</summary>
    public static async ValueTask<Guid?> ResolveTdsAccountAsync(TdsWithholding? tds, AccountingDbContext dbContext, CancellationToken cancellationToken) =>
        tds is null ? null : await TdsPayableAccount.GetOrCreateAsync(dbContext, cancellationToken).ConfigureAwait(false);

    /// <summary>Replaces the expense's TDS deduction row with one for its current TDS (none when no TDS). Not saved.</summary>
    public static async Task SyncTdsDeductionAsync(AccountingDbContext dbContext, Expense expense, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(expense);

        var existing = await dbContext.TdsDeductions
            .Where(d => d.SourceType == TdsDeduction.SourceTypes.Expense && d.SourceId == expense.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        dbContext.TdsDeductions.RemoveRange(existing);

        if (expense.Tds is { } tds)
        {
            dbContext.TdsDeductions.Add(TdsDeduction.Create(
                TdsDeduction.SourceTypes.Expense, expense.Id, expense.ExpenseDateUtc, expense.VendorName, expense.SupplierVatNumber,
                tds, expense.ReceiptReference, expense.BranchId));
        }
    }

    public static IReadOnlyList<PostVoucherLine> BuildLines(
        Expense expense, Guid expenseAccountId, Guid? inputVatAccountId, Guid creditAccountId, Guid? tdsAccountId = null)
    {
        ArgumentNullException.ThrowIfNull(expense);

        var lines = new List<PostVoucherLine>(4)
        {
            new(expenseAccountId, expense.Category, DebitAmount: expense.NetAmount, CreditAmount: 0m),
        };

        if (expense.VatAmount > 0)
        {
            if (inputVatAccountId is not { } vatAccountId)
            {
                throw new InvalidOperationException("An expense with VAT needs the Input VAT Recoverable account.");
            }

            string vatLine = "Input VAT"
                + (expense.ReceiptReference is null ? string.Empty : " — bill " + expense.ReceiptReference)
                + (expense.SupplierVatNumber is null ? string.Empty : " (VAT no. " + expense.SupplierVatNumber + ")");
            lines.Add(new PostVoucherLine(vatAccountId, vatLine, DebitAmount: expense.VatAmount, CreditAmount: 0m));
        }

        string creditLine = "Expense paid";
        if (expense.IsOnCredit)
        {
            creditLine = expense.VendorName is null ? "Payable" : "Payable to " + expense.VendorName;
        }

        // The vendor gets (or is owed) the gross less the TDS withheld; the TDS is owed to IRD instead.
        lines.Add(new PostVoucherLine(creditAccountId, creditLine, DebitAmount: 0m, CreditAmount: expense.PayableAmount));
        if (expense.Tds is { } tds)
        {
            if (tdsAccountId is not { } tdsId)
            {
                throw new InvalidOperationException("An expense with TDS needs the TDS Payable account.");
            }

            string tdsLine = string.Create(
                System.Globalization.CultureInfo.InvariantCulture,
                $"TDS withheld — {tds.CategoryName} @ {tds.RatePercent:0.##}%");
            lines.Add(new PostVoucherLine(tdsId, tdsLine, DebitAmount: 0m, CreditAmount: tds.Amount));
        }

        return lines;
    }
}

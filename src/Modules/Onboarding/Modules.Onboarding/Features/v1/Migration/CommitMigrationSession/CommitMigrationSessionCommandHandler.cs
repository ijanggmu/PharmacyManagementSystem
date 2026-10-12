using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Onboarding.Contracts.Dtos;
using FSH.Modules.Onboarding.Contracts.v1.Migration;
using FSH.Modules.Onboarding.Data;
using FSH.Modules.Onboarding.Domain;
using FSH.Modules.Suppliers.Contracts.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Onboarding.Features.v1.Migration.CommitMigrationSession;

/// <summary>
/// Port of <c>completeMigrationSession</c> + the five <c>importOpening*</c>/<c>setOpeningCashOrBank</c>
/// functions, combined into one commit. Reuses existing cross-module surfaces instead of duplicating
/// voucher/stock logic (per the migration brief):
/// <list type="bullet">
/// <item><see cref="IStockReceiptService"/> — creates/tops-up the opening stock batches (Inventory).</item>
/// <item><see cref="ISupplierLedgerService"/> — posts each supplier's AP subledger entry (Suppliers).</item>
/// <item><see cref="IVoucherPostingService"/> + <see cref="IAccountingAccountResolver"/> — posts one
/// balanced GL voucher per non-empty category (Accounting).</item>
/// </list>
/// Every category maps its non-equity side to <see cref="AccountingSystemAccountCodes"/> and plugs the
/// other side to <c>OwnersEquity</c> (the .NET seeded chart of accounts has no separate "3900 Opening
/// balance equity" sub-account the way the Postgres seed data did — see the migration report for why
/// that's a deliberate, documented divergence rather than a gap).
///
/// The AR side of customer opening balances posts to the GL only: unlike Suppliers (whose Contracts
/// project exposes <see cref="ISupplierLedgerService.RecordPurchaseAsync"/> to bump the AP subledger),
/// Customers.Contracts exposes no symmetric "increase the receivable balance" surface — only
/// <c>RecordCustomerPaymentCommand</c>, which decreases it. Wiring the per-customer subledger would
/// require adding a new synchronous service (or integration event + handler) to the Customers module,
/// which is out of scope for this change; flagged in the migration report as a known follow-up.
/// </summary>
public sealed class CommitMigrationSessionCommandHandler(
    OnboardingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IStockReceiptService stockReceiptService,
    ISupplierLedgerService supplierLedgerService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<CommitMigrationSessionCommand, MigrationCommitResultDto>
{
    public async ValueTask<MigrationCommitResultDto> Handle(CommitMigrationSessionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var session = await dbContext.MigrationSessions
            .FirstOrDefaultAsync(s => s.Id == command.SessionId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("Migration session not found.");

        // Guard BEFORE any voucher/stock/ledger side effect — a second commit attempt never
        // double-posts (mirrors the "committing twice" test requirement).
        session.EnsureDraft();

        var lineItems = await dbContext.MigrationLineItems
            .Where(l => l.SessionId == session.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var cutoverUtc = session.CutoverDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        decimal totalPosted = 0m;

        // Every posting below lands on one branch: the branch the wizard chose, else the caller's current
        // branch. Callers with access to all branches may choose any of them, everyone else only their own.
        Guid? branchId = command.BranchId is { } requested
            ? await currentBranch.ResolveListBranchFilterAsync(requested, cancellationToken).ConfigureAwait(false)
            : await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        Guid? cashVoucherId = await PostSimpleBalanceAsync(
            lineItems, MigrationCategory.Cash, AccountingSystemAccountCodes.Cash,
            "MigrationOpeningCash", session.Id, "Opening cash balance", branchId, cancellationToken).ConfigureAwait(false);

        Guid? bankVoucherId = await PostSimpleBalanceAsync(
            lineItems, MigrationCategory.Bank, AccountingSystemAccountCodes.Bank,
            "MigrationOpeningBank", session.Id, "Opening bank balance", branchId, cancellationToken).ConfigureAwait(false);

        Guid? customerVoucherId = await PostPartyBalancesAsync(
            lineItems, MigrationCategory.Customer, AccountingSystemAccountCodes.AccountsReceivable,
            "MigrationOpeningCustomers", session.Id, debitParty: true, branchId, cancellationToken).ConfigureAwait(false);

        Guid? supplierVoucherId = null;
        var supplierLines = lineItems.Where(l => l.Category == MigrationCategory.Supplier).ToList();
        if (supplierLines.Count > 0)
        {
            foreach (var line in supplierLines)
            {
                await supplierLedgerService.RecordPurchaseAsync(
                    line.PartyId!.Value, line.Amount!.Value, cutoverUtc,
                    "Opening balance (migration wizard)", "MigrationOpeningSupplier", session.Id, branchId, cancellationToken)
                    .ConfigureAwait(false);
            }

            supplierVoucherId = await PostPartyBalancesAsync(
                lineItems, MigrationCategory.Supplier, AccountingSystemAccountCodes.AccountsPayable,
                "MigrationOpeningSuppliers", session.Id, debitParty: false, branchId, cancellationToken).ConfigureAwait(false);
        }

        Guid? stockVoucherId = null;
        var stockLines = lineItems.Where(l => l.Category == MigrationCategory.Stock).ToList();
        if (stockLines.Count > 0)
        {
            var receiptLines = stockLines
                .Select(l => new StockReceiptLine(
                    l.MedicineId!.Value, l.BatchNo!, l.ExpiryDate!.Value, l.Quantity!.Value,
                    l.UnitCost!.Value, l.SellingPrice ?? 0m, RackLocation: null))
                .ToList();

            await stockReceiptService.ReceiveAsync(
                new StockReceiptRequest("MigrationOpeningStock", session.Id, receiptLines, branchId), cancellationToken)
                .ConfigureAwait(false);

            decimal stockValue = stockLines.Sum(l => l.Quantity!.Value * l.UnitCost!.Value);
            if (stockValue > 0)
            {
                var inventoryId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, cancellationToken).ConfigureAwait(false);
                var equityId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, cancellationToken).ConfigureAwait(false);

                stockVoucherId = await voucherPostingService.PostSystemVoucherAsync(
                    new PostVoucherRequest(
                        "system_opening_balance", "MigrationOpeningStock", session.Id, "Opening stock (migration wizard)",
                        [
                            new PostVoucherLine(inventoryId, "Opening stock", stockValue, 0m),
                            new PostVoucherLine(equityId, "Opening balance", 0m, stockValue),
                        ],
                        BranchId: branchId),
                    cancellationToken).ConfigureAwait(false);
                totalPosted += stockValue;
            }
        }

        totalPosted += lineItems
            .Where(l => l.Category is MigrationCategory.Cash or MigrationCategory.Bank or MigrationCategory.Customer or MigrationCategory.Supplier)
            .Sum(l => l.Amount ?? 0m);

        session.Commit(
            currentUser.Name ?? currentUser.GetUserId().ToString(),
            bankVoucherId, cashVoucherId, customerVoucherId, supplierVoucherId, stockVoucherId);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return new MigrationCommitResultDto(
            session.Id, bankVoucherId, cashVoucherId, customerVoucherId, supplierVoucherId, stockVoucherId, totalPosted);
    }

    /// <summary>Cash/Bank: Dr the given account, Cr Owner's Equity, for the sum of that category's lines
    /// (the Next.js wizard only ever allows one line per category here, but summing tolerates more).</summary>
    private async ValueTask<Guid?> PostSimpleBalanceAsync(
        List<MigrationLineItem> lineItems, MigrationCategory category, string accountCode,
        string referenceType, Guid referenceId, string description, Guid? branchId, CancellationToken cancellationToken)
    {
        decimal amount = lineItems.Where(l => l.Category == category).Sum(l => l.Amount ?? 0m);
        if (amount <= 0)
        {
            return null;
        }

        var accountId = await accountResolver.ResolveByCodeAsync(accountCode, cancellationToken).ConfigureAwait(false);
        var equityId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, cancellationToken).ConfigureAwait(false);

        return await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                "system_opening_balance", referenceType, referenceId, description,
                [
                    new PostVoucherLine(accountId, description, amount, 0m),
                    new PostVoucherLine(equityId, "Opening balance", 0m, amount),
                ],
                BranchId: branchId),
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Customer/Supplier: one line per party against <paramref name="accountCode"/> (AR debit
    /// for customers, AP credit for suppliers) plus one aggregate Owner's Equity line.</summary>
    private async ValueTask<Guid?> PostPartyBalancesAsync(
        List<MigrationLineItem> lineItems, MigrationCategory category, string accountCode,
        string referenceType, Guid referenceId, bool debitParty, Guid? branchId, CancellationToken cancellationToken)
    {
        var partyLines = lineItems.Where(l => l.Category == category).ToList();
        if (partyLines.Count == 0)
        {
            return null;
        }

        decimal total = partyLines.Sum(l => l.Amount ?? 0m);
        if (total <= 0)
        {
            return null;
        }

        var accountId = await accountResolver.ResolveByCodeAsync(accountCode, cancellationToken).ConfigureAwait(false);
        var equityId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, cancellationToken).ConfigureAwait(false);

        var lines = new List<PostVoucherLine>();
        foreach (var line in partyLines)
        {
            decimal amount = line.Amount ?? 0m;
            string description = $"Opening balance — {category} {line.PartyId}";
            lines.Add(debitParty
                ? new PostVoucherLine(accountId, description, amount, 0m)
                : new PostVoucherLine(accountId, description, 0m, amount));
        }

        lines.Add(debitParty
            ? new PostVoucherLine(equityId, "Opening balance", 0m, total)
            : new PostVoucherLine(equityId, "Opening balance", total, 0m));

        return await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest("system_opening_balance", referenceType, referenceId, $"Opening {category} balances (migration wizard)", lines, branchId),
            cancellationToken).ConfigureAwait(false);
    }
}

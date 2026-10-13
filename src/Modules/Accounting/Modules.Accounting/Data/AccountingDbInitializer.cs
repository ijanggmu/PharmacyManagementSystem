using FSH.Framework.Persistence;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Accounting.Data;

public sealed partial class AccountingDbInitializer(
    AccountingDbContext dbContext,
    IBranchService branchService,
    ILogger<AccountingDbInitializer> logger) : IDbInitializer
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).Any())
        {
            await dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("[Accounting] applied migrations");
        }
    }

    /// <summary>
    /// Seeds the chart's five root heads and the standard system accounts under them (stable codes other
    /// modules' account mapping relies on), attaches any pre-hierarchy account to its head, and seeds the
    /// tenant's voucher-numbering sequence row. All idempotent.
    /// </summary>
    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        var roots = await EnsureRootHeadsAsync(cancellationToken).ConfigureAwait(false);

        // Per-code backfill: adds any standard system account the tenant does not have yet (for example
        // 1150 Input VAT Recoverable on tenants seeded before it existed). Codes are immutable, so a code
        // that is already present is never touched.
        var standardAccounts = new[]
        {
            AccountingAccount.Create("1000", "Cash", AccountingAccountType.Asset, isSystem: true),
            AccountingAccount.Create("1010", "Bank", AccountingAccountType.Asset, isSystem: true),
            AccountingAccount.Create("1100", "Accounts Receivable", AccountingAccountType.Asset, isSystem: true),
            AccountingAccount.Create("1150", "Input VAT Recoverable", AccountingAccountType.Asset, isSystem: true),
            AccountingAccount.Create("1160", ChequeAccounts.ChequesInHandName, AccountingAccountType.Asset, isSystem: true),
            AccountingAccount.Create("1190", "Insurance Receivable", AccountingAccountType.Asset, isSystem: true),
            AccountingAccount.Create("1200", "Inventory", AccountingAccountType.Asset, isSystem: true),
            AccountingAccount.Create("2000", "Accounts Payable", AccountingAccountType.Liability, isSystem: true),
            AccountingAccount.Create("2100", "VAT Payable", AccountingAccountType.Liability, isSystem: true),
            AccountingAccount.Create("2150", "TDS Payable", AccountingAccountType.Liability, isSystem: true),
            AccountingAccount.Create("2160", ChequeAccounts.ChequesIssuedName, AccountingAccountType.Liability, isSystem: true),
            AccountingAccount.Create("3000", "Owner's Equity", AccountingAccountType.Equity, isSystem: true),
            AccountingAccount.Create("3900", "Retained Earnings", AccountingAccountType.Equity, isSystem: true),
            AccountingAccount.Create("4000", "Sales Revenue", AccountingAccountType.Revenue, isSystem: true),
            AccountingAccount.Create("4100", "Sales Returns & Allowances", AccountingAccountType.Revenue, isSystem: true),
            AccountingAccount.Create("5000", "Cost of Goods Sold", AccountingAccountType.Expense, isSystem: true),
            AccountingAccount.Create("5100", "General Expenses", AccountingAccountType.Expense, isSystem: true),
            AccountingAccount.Create("5980", "Cash Short & Over", AccountingAccountType.Expense, isSystem: true),
            AccountingAccount.Create("5990", "Rounding Off", AccountingAccountType.Expense, isSystem: true),
        };

        var existingCodes = await dbContext.Accounts
            .Select(a => a.Code)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var missingAccounts = standardAccounts.Where(a => !existingCodes.Contains(a.Code)).ToList();
        if (missingAccounts.Count > 0)
        {
            dbContext.Accounts.AddRange(missingAccounts);
            logger.LogInformation("[Accounting] seeded missing standard system accounts");
        }

        // Attach every account without a parent (new standard ones, and all rows created before the chart
        // became a tree) to its head. Existing codes never change.
        var orphans = await dbContext.Accounts
            .Where(a => a.ParentId == null)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        foreach (var account in orphans.Concat(missingAccounts).Where(a => !a.IsRootHead))
        {
            if (roots.TryGetValue(account.AccountType, out var root))
            {
                account.AttachToRoot(root);
            }
        }

        // TDS categories with the default Nepal rates (TdsCategoryDefaults), per code: a category the tenant
        // already has (edited or deactivated) is never touched.
        var existingTdsCodes = await dbContext.TdsCategories
            .Select(c => c.Code)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var missingTds = TdsCategoryDefaults.All
            .Select((d, index) => (d, index))
            .Where(x => !existingTdsCodes.Contains(x.d.Code))
            .Select(x => TdsCategory.Create(x.d.Code, x.d.Name, x.d.RatePercent, x.index, "system"))
            .ToList();
        if (missingTds.Count > 0)
        {
            dbContext.TdsCategories.AddRange(missingTds);
            logger.LogInformation("[Accounting] seeded default TDS categories");
        }

        // No voucher-sequence seeding: each type-wise series row is created on first use by
        // AccountingVoucherSequenceService's upsert.

        // The tenant's single posting-lock row (no lock set). Seeding it up front means postings never have
        // to create it; AccountingPostingLockService still upserts it for tenants seeded before this.
        if (!await dbContext.PostingLocks.AnyAsync(cancellationToken).ConfigureAwait(false))
        {
            dbContext.PostingLocks.Add(AccountingPostingLock.CreateEmpty());
            logger.LogInformation("[Accounting] seeded posting lock");
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        await BackfillUnassignedBranchAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Vouchers posted from background event handlers before branch propagation (purchases, AP/AR
    /// payments, consignment settlements, sale cancellations) were saved with no branch, so they
    /// dropped out of every per-branch report. Attribute them to the tenant's default (main) branch.
    /// Idempotent: once nothing is unassigned, both updates touch zero rows. Tenant-filtered by the
    /// context's query filter.
    /// </summary>
    private async Task BackfillUnassignedBranchAsync(CancellationToken cancellationToken)
    {
        Guid? defaultBranchId = await branchService.GetDefaultBranchIdAsync(cancellationToken).ConfigureAwait(false);
        if (defaultBranchId is not { } branchId)
        {
            return; // Tenant has no branches yet — nothing to attribute to.
        }

        int vouchers = await dbContext.Vouchers
            .Where(v => v.BranchId == null)
            .ExecuteUpdateAsync(u => u.SetProperty(v => v.BranchId, branchId), cancellationToken)
            .ConfigureAwait(false);
        int lines = await dbContext.VoucherLines
            .Where(l => l.BranchId == null)
            .ExecuteUpdateAsync(u => u.SetProperty(l => l.BranchId, branchId), cancellationToken)
            .ConfigureAwait(false);

        if (vouchers + lines > 0)
        {
            LogBranchBackfill(logger, vouchers, lines, branchId);
        }
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Accounting] attributed {VoucherCount} vouchers and {LineCount} lines with no branch to the default branch {BranchId}")]
    private static partial void LogBranchBackfill(ILogger logger, int voucherCount, int lineCount, Guid branchId);

    private async Task<Dictionary<AccountingAccountType, AccountingAccount>> EnsureRootHeadsAsync(CancellationToken cancellationToken)
    {
        var rootCodes = AccountingAccount.RootHeads.Values.Select(v => v.Code).ToList();
        var existing = await dbContext.Accounts
            .Where(a => rootCodes.Contains(a.Code))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var roots = new Dictionary<AccountingAccountType, AccountingAccount>();
        bool seeded = false;
        foreach (var (type, (code, _)) in AccountingAccount.RootHeads)
        {
            var match = existing.FirstOrDefault(a => a.Code == code);
            if (match is null)
            {
                match = AccountingAccount.CreateRootHead(type);
                dbContext.Accounts.Add(match);
                seeded = true;
            }
            else if (!match.IsRootHead || match.AccountType != type)
            {
                // A user account already owns this code — leave it alone; that head stays without a root row.
                if (logger.IsEnabled(LogLevel.Warning))
                {
                    logger.LogWarning("[Accounting] code {Code} is taken by a non-root account; root head not seeded", code);
                }

                continue;
            }

            roots[type] = match;
        }

        if (seeded)
        {
            logger.LogInformation("[Accounting] seeded chart root heads");
        }

        return roots;
    }
}

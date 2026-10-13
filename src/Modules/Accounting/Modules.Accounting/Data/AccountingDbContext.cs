using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Persistence.Context;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Accounting.Data;

public sealed class AccountingDbContext : BaseDbContext
{
    public const string Schema = "accounting";

    public AccountingDbContext(
        IMultiTenantContextAccessor<AppTenantInfo> multiTenantContextAccessor,
        DbContextOptions<AccountingDbContext> options,
        IOptions<DatabaseOptions> settings,
        IHostEnvironment environment) : base(multiTenantContextAccessor, options, settings, environment) { }

    public DbSet<AccountingAccount> Accounts => Set<AccountingAccount>();
    public DbSet<AccountingVoucher> Vouchers => Set<AccountingVoucher>();
    public DbSet<AccountingVoucherLine> VoucherLines => Set<AccountingVoucherLine>();
    public DbSet<AccountingVoucherSequence> VoucherSequences => Set<AccountingVoucherSequence>();
    public DbSet<BankDeposit> BankDeposits => Set<BankDeposit>();
    public DbSet<BankReconciliation> BankReconciliations => Set<BankReconciliation>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<AccountingPostingLock> PostingLocks => Set<AccountingPostingLock>();
    public DbSet<AccountingPostingLockChange> PostingLockChanges => Set<AccountingPostingLockChange>();
    public DbSet<AccountingPendingReversal> PendingReversals => Set<AccountingPendingReversal>();
    public DbSet<BankStatementImport> BankStatementImports => Set<BankStatementImport>();
    public DbSet<BankStatementLine> BankStatementLines => Set<BankStatementLine>();
    public DbSet<OpeningBalanceHistoryEntry> OpeningBalanceHistory => Set<OpeningBalanceHistoryEntry>();
    public DbSet<FiscalYearClose> FiscalYearCloses => Set<FiscalYearClose>();
    public DbSet<AccountingPaymentMethodAccount> PaymentMethodAccounts => Set<AccountingPaymentMethodAccount>();
    public DbSet<TdsCategory> TdsCategories => Set<TdsCategory>();
    public DbSet<TdsDeduction> TdsDeductions => Set<TdsDeduction>();
    public DbSet<AccountCashFlowTag> AccountCashFlowTags => Set<AccountCashFlowTag>();
    public DbSet<FixedAsset> FixedAssets => Set<FixedAsset>();
    public DbSet<FixedAssetDepreciationEntry> FixedAssetDepreciationEntries => Set<FixedAssetDepreciationEntry>();
    public DbSet<DepreciationRun> DepreciationRuns => Set<DepreciationRun>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AccountingDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}

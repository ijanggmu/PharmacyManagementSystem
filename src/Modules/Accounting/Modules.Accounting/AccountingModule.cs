using Asp.Versioning;
using FSH.Framework.Eventing;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Web.Modules;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Features.v1.Accounts.ActivateAccount;
using FSH.Modules.Accounting.Features.v1.Accounts.CreateAccount;
using FSH.Modules.Accounting.Features.v1.Accounts.DeactivateAccount;
using FSH.Modules.Accounting.Features.v1.Accounts.GetAccountById;
using FSH.Modules.Accounting.Features.v1.Accounts.GetNextAccountCode;
using FSH.Modules.Accounting.Features.v1.Accounts.ChangeAccountsParent;
using FSH.Modules.Accounting.Features.v1.Accounts.SearchAccounts;
using FSH.Modules.Accounting.Features.v1.Accounts.UpdateAccount;
using FSH.Modules.Accounting.Features.v1.Banking.AutoMatchBankStatementImport;
using FSH.Modules.Accounting.Features.v1.Banking.CompleteBankStatementImport;
using FSH.Modules.Accounting.Features.v1.Banking.CreateBankStatementImport;
using FSH.Modules.Accounting.Features.v1.Banking.GetBankStatementImportById;
using FSH.Modules.Accounting.Features.v1.Banking.IgnoreBankStatementLine;
using FSH.Modules.Accounting.Features.v1.Banking.MatchBankStatementLine;
using FSH.Modules.Accounting.Features.v1.Banking.ReconcileBankAccount;
using FSH.Modules.Accounting.Features.v1.Banking.RecordBankDeposit;
using FSH.Modules.Accounting.Features.v1.Banking.SearchBankDeposits;
using FSH.Modules.Accounting.Features.v1.Banking.SearchBankReconciliations;
using FSH.Modules.Accounting.Features.v1.Banking.SearchBankStatementImports;
using FSH.Modules.Accounting.Features.v1.Banking.UnmatchBankStatementLine;
using FSH.Modules.Accounting.Features.v1.Expenses.DeleteExpense;
using FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;
using FSH.Modules.Accounting.Features.v1.Expenses.SearchExpenses;
using FSH.Modules.Accounting.Features.v1.Expenses.UpdateExpense;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.EditOpeningBalances;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.GetOpeningBalances;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.ResetOpeningBalances;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.SearchOpeningBalanceHistory;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.SetOpeningBalances;
using FSH.Modules.Accounting.Features.v1.PaymentAccounts.CreateCashBankAccount;
using FSH.Modules.Accounting.Features.v1.PaymentAccounts.GetPaymentMethodAccounts;
using FSH.Modules.Accounting.Features.v1.PaymentAccounts.UpdatePaymentMethodAccounts;
using FSH.Modules.Accounting.Features.v1.PostingLock.GetPostingLock;
using FSH.Modules.Accounting.Features.v1.PostingLock.SetPostingLock;
using FSH.Modules.Accounting.Features.v1.Reports.GetApAging;
using FSH.Modules.Accounting.Features.v1.Reports.GetApGlReconciliation;
using FSH.Modules.Accounting.Features.v1.Reports.GetArAging;
using FSH.Modules.Accounting.Features.v1.Reports.GetArGlReconciliation;
using FSH.Modules.Accounting.Features.v1.Reports.GetBalanceSheet;
using FSH.Modules.Accounting.Features.v1.Reports.GetCashMovement;
using FSH.Modules.Accounting.Features.v1.Reports.GetGeneralLedger;
using FSH.Modules.Accounting.Features.v1.Reports.GetInventoryGlReconciliation;
using FSH.Modules.Accounting.Features.v1.Reports.GetPeriodTrialBalance;
using FSH.Modules.Accounting.Features.v1.Reports.GetProfitAndLoss;
using FSH.Modules.Accounting.Features.v1.Reports.GetReportsOverview;
using FSH.Modules.Accounting.Features.v1.Reports.GetTrialBalance;
using FSH.Modules.Accounting.Features.v1.Reports.GetTrialBalanceGrouped;
using FSH.Modules.Accounting.Features.v1.Reports.GetVatReturn;
using FSH.Modules.Accounting.Features.v1.Vat.RecordVatPayment;
using FSH.Modules.Accounting.Features.v1.Vouchers.CreateManualVoucher;
using FSH.Modules.Accounting.Features.v1.Vouchers.DeleteVoucher;
using FSH.Modules.Accounting.Features.v1.Vouchers.GetVoucherById;
using FSH.Modules.Accounting.Features.v1.Vouchers.PostVoucher;
using FSH.Modules.Accounting.Features.v1.Vouchers.ReverseVoucher;
using FSH.Modules.Accounting.Features.v1.Vouchers.SearchVouchers;
using FSH.Modules.Accounting.Features.v1.Vouchers.UpdateVoucher;
using FSH.Modules.Accounting.Features.v1.Vouchers.VoidVoucher;
using FSH.Modules.Accounting.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

[assembly: FshModule(typeof(FSH.Modules.Accounting.AccountingModule), 870)]

namespace FSH.Modules.Accounting;

public sealed class AccountingModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        PermissionConstants.Register(AccountingPermissions.All);

        builder.Services.AddHeroDbContext<AccountingDbContext>();
        builder.Services.AddScoped<IDbInitializer, AccountingDbInitializer>();

        builder.Services.AddScoped<AccountingVoucherSequenceService>();
        builder.Services.AddScoped<IAccountingVoucherNumbers>(sp => sp.GetRequiredService<AccountingVoucherSequenceService>());
        builder.Services.AddScoped<OpeningBalanceService>();
        builder.Services.AddScoped<AccountingPostingLockService>();

        // The cross-module surface: any other module references only Modules.Accounting.Contracts
        // and injects these interfaces — never the runtime type or this module's assembly.
        builder.Services.AddScoped<VoucherPostingService>();
        builder.Services.AddScoped<IVoucherPostingService>(sp => sp.GetRequiredService<VoucherPostingService>());
        builder.Services.AddScoped<IAccountingAccountResolver, AccountingAccountResolver>();

        // Tenant payment-method -> money-account mapping, used by every flow that moves money.
        builder.Services.AddScoped<IPaymentMethodAccountResolver, PaymentMethodAccountResolver>();

        // Subscribe to cross-module integration events handled by this assembly (Sales/Purchasing/
        // Suppliers/Customers post their vouchers this way — see docs/pharmacy-modules-plan.md §2).
        builder.Services.AddIntegrationEventHandlers(typeof(AccountingModule).Assembly);

        builder.Services.AddHealthChecks()
            .AddDbContextCheck<AccountingDbContext>(
                name: "db:accounting",
                failureStatus: HealthStatus.Unhealthy);
    }

    public void ConfigureMiddleware(IApplicationBuilder app)
    {
        // No custom middleware needed
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        var versionSet = endpoints.NewApiVersionSet()
            .HasApiVersion(new ApiVersion(1))
            .ReportApiVersions()
            .Build();

        var group = endpoints
            .MapGroup("api/v{version:apiVersion}/accounting")
            .WithTags("Accounting")
            .WithApiVersionSet(versionSet)
            .RequireAuthorization();

        group.MapCreateAccountEndpoint();
        group.MapUpdateAccountEndpoint();
        group.MapEnableAccountEndpoint();
        group.MapDisableAccountEndpoint();
        group.MapChangeAccountsParentEndpoint();
        group.MapGetNextAccountCodeEndpoint();
        group.MapGetAccountByIdEndpoint();
        group.MapSearchAccountsEndpoint();
        group.MapCreateCashBankAccountEndpoint();
        group.MapGetPaymentMethodAccountsEndpoint();
        group.MapUpdatePaymentMethodAccountsEndpoint();

        group.MapCreateManualVoucherEndpoint();
        group.MapUpdateVoucherEndpoint();
        group.MapDeleteVoucherEndpoint();
        group.MapFinalizeVoucherEndpoint();
        group.MapVoidVoucherEndpoint();
        group.MapReverseVoucherEndpoint();
        group.MapGetVoucherByIdEndpoint();
        group.MapSearchVouchersEndpoint();

        group.MapGetTrialBalanceEndpoint();
        group.MapGetTrialBalanceGroupedEndpoint();
        group.MapGetPeriodTrialBalanceEndpoint();
        group.MapGetVatReturnEndpoint();
        group.MapGetBalanceSheetEndpoint();
        group.MapGetProfitAndLossEndpoint();
        group.MapGetCashMovementEndpoint();
        group.MapGetGeneralLedgerEndpoint();
        group.MapGetArAgingEndpoint();
        group.MapGetApAgingEndpoint();
        group.MapGetArGlReconciliationEndpoint();
        group.MapGetApGlReconciliationEndpoint();
        group.MapGetInventoryGlReconciliationEndpoint();
        group.MapGetReportsOverviewEndpoint();
        group.MapCreateVatPaymentEndpoint();

        group.MapCreateBankDepositEndpoint();
        group.MapSearchBankDepositsEndpoint();
        group.MapCreateBankReconciliationEndpoint();
        group.MapSearchBankReconciliationsEndpoint();
        group.MapSearchBankStatementImportsEndpoint();

        group.MapCreateBankStatementImportEndpoint();
        group.MapGetBankStatementImportByIdEndpoint();
        group.MapGenerateBankStatementMatchesEndpoint();
        group.MapFinalizeBankStatementImportEndpoint();
        group.MapAssignBankStatementLineEndpoint();
        group.MapResetBankStatementLineMatchEndpoint();
        group.MapMarkBankStatementLineIgnoredEndpoint();

        group.MapCreateExpenseEndpoint();
        group.MapSearchExpensesEndpoint();
        group.MapUpdateExpenseEndpoint();
        group.MapDeleteExpenseEndpoint();

        group.MapGetPostingLockEndpoint();
        group.MapSetPostingLockEndpoint();

        group.MapGetOpeningBalancesEndpoint();
        group.MapSearchOpeningBalanceHistoryEndpoint();
        group.MapSetOpeningBalancesEndpoint();
        group.MapEditOpeningBalancesEndpoint();
        group.MapResetOpeningBalancesEndpoint();
    }
}

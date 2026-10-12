using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Suppliers.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

public sealed class SupplierOpeningBalanceRecordedIntegrationEventHandlerTests
{
    private static readonly Guid PayableId = Guid.CreateVersion7();
    private static readonly Guid EquityId = Guid.CreateVersion7();

    private static (SupplierOpeningBalanceRecordedIntegrationEventHandler Handler, IVoucherPostingService Posting) CreateHandler()
    {
        var posting = Substitute.For<IVoucherPostingService>();
        var resolver = Substitute.For<IAccountingAccountResolver>();
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, Arg.Any<CancellationToken>()).Returns(PayableId);
        resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity, Arg.Any<CancellationToken>()).Returns(EquityId);
        return (new SupplierOpeningBalanceRecordedIntegrationEventHandler(posting, resolver), posting);
    }

    private static SupplierOpeningBalanceRecordedIntegrationEvent Event(decimal amount, DateTime date, Guid? branchId = null) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "test-tenant", "corr", "Suppliers", Guid.CreateVersion7(),
            Guid.CreateVersion7(), "Himal Pharma", amount, date, branchId);

    [Fact]
    public async Task Positive_Opening_Balance_Should_Credit_Payable_And_Debit_Equity_On_The_Entry_Date_And_Branch()
    {
        var (handler, posting) = CreateHandler();
        var branchId = Guid.CreateVersion7();
        var date = new DateTime(2026, 9, 1, 5, 0, 0, DateTimeKind.Utc);
        var @event = Event(1500m, date, branchId);

        await handler.HandleAsync(@event);

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.VoucherType == "system_opening_balance"
                && r.ReferenceType == "SupplierOpeningBalance"
                && r.ReferenceId == @event.LedgerEntryId
                && r.BranchId == branchId
                && r.VoucherDateUtc == date
                && r.Lines.Any(l => l.AccountId == PayableId && l.CreditAmount == 1500m && l.DebitAmount == 0m)
                && r.Lines.Any(l => l.AccountId == EquityId && l.DebitAmount == 1500m && l.CreditAmount == 0m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Negative_Opening_Balance_Should_Debit_Payable_And_Credit_Equity()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(-200m, DateTime.UtcNow));

        await posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r =>
                r.Lines.Any(l => l.AccountId == PayableId && l.DebitAmount == 200m)
                && r.Lines.Any(l => l.AccountId == EquityId && l.CreditAmount == 200m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Zero_Opening_Balance_Should_Post_Nothing()
    {
        var (handler, posting) = CreateHandler();

        await handler.HandleAsync(Event(0m, DateTime.UtcNow));

        await posting.DidNotReceiveWithAnyArgs().PostSystemVoucherAsync(default!, default);
    }
}

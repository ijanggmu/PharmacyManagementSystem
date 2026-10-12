using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Purchasing.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

public sealed class PurchaseOrderReceivedIntegrationEventHandlerTests
{
    private readonly IVoucherPostingService _posting = Substitute.For<IVoucherPostingService>();
    private readonly IAccountingAccountResolver _resolver = Substitute.For<IAccountingAccountResolver>();

    public PurchaseOrderReceivedIntegrationEventHandlerTests()
    {
        _resolver.ResolveByCodeAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(_ => Guid.CreateVersion7());
    }

    private static PurchaseOrderReceivedIntegrationEvent Event(decimal total, decimal vat) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Purchasing", Guid.CreateVersion7(), Guid.CreateVersion7(), total, DateTime.UtcNow, vat);

    [Theory]
    [InlineData(0, 0)]
    [InlineData(0.001, 0)]
    public async Task HandleAsync_Should_PostNothing_ForAZeroValueReceipt(double total, double vat)
    {
        await new PurchaseOrderReceivedIntegrationEventHandler(_posting, _resolver).HandleAsync(Event((decimal)total, (decimal)vat));

        await _posting.DidNotReceiveWithAnyArgs().PostSystemVoucherAsync(default!, default);
    }

    [Fact]
    public async Task HandleAsync_Should_Post_ForAPricedReceipt()
    {
        await new PurchaseOrderReceivedIntegrationEventHandler(_posting, _resolver).HandleAsync(Event(100m, 13m));

        await _posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.Lines.Sum(l => l.CreditAmount) == 113m), Arg.Any<CancellationToken>());
    }
}

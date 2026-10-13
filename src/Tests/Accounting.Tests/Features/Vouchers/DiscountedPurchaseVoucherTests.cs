using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.IntegrationEventHandlers;
using FSH.Modules.Purchasing.Contracts.Events;
using NSubstitute;

namespace Accounting.Tests.Features.Vouchers;

/// <summary>
/// Purchases carrying free goods and trade/bill discounts: Purchasing sends the DISCOUNTED net (free units add no
/// value), so the voucher is Dr Inventory (net of discounts) + Dr Input VAT / Cr Accounts Payable (net + VAT),
/// balanced, and a void reverses that same voucher.
/// </summary>
public sealed class DiscountedPurchaseVoucherTests
{
    private static readonly Guid InventoryId = Guid.CreateVersion7();
    private static readonly Guid InputVatId = Guid.CreateVersion7();
    private static readonly Guid PayableId = Guid.CreateVersion7();

    private readonly IVoucherPostingService _posting = Substitute.For<IVoucherPostingService>();
    private readonly IAccountingAccountResolver _resolver = Substitute.For<IAccountingAccountResolver>();

    public DiscountedPurchaseVoucherTests()
    {
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Inventory, Arg.Any<CancellationToken>()).Returns(InventoryId);
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.InputVatRecoverable, Arg.Any<CancellationToken>()).Returns(InputVatId);
        _resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsPayable, Arg.Any<CancellationToken>()).Returns(PayableId);
    }

    private static bool Is(PostVoucherRequest r, decimal inventory, decimal vat, decimal payable) =>
        r.Lines.Single(l => l.AccountId == InventoryId).DebitAmount == inventory
        && r.Lines.Single(l => l.AccountId == InputVatId).DebitAmount == vat
        && r.Lines.Single(l => l.AccountId == PayableId).CreditAmount == payable
        && r.Lines.Sum(l => l.DebitAmount) == r.Lines.Sum(l => l.CreditAmount);

    [Fact]
    public async Task PurchaseOrder_Should_Post_Inventory_Net_Of_Discounts()
    {
        // 10 + 1 free at 100, 10% trade discount, 5% bill discount: taxable 855, VAT 111.15.
        var @event = new PurchaseOrderReceivedIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Purchasing", Guid.CreateVersion7(), Guid.CreateVersion7(),
            TotalAmount: 855m, OrderDateUtc: DateTime.UtcNow, VatAmount: 111.15m);

        await new PurchaseOrderReceivedIntegrationEventHandler(_posting, _resolver).HandleAsync(@event);

        await _posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.ReferenceType == "PurchaseOrder" && Is(r, 855m, 111.15m, 966.15m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DirectReceipt_Should_Post_Inventory_Net_Of_Discounts()
    {
        // Subtotal 1100, line discount 100, bill discount 50 -> net 950; VAT 111.15; bill 1061.15.
        var @event = new DirectGoodsReceiptPostedIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "t", "c", "Purchasing", Guid.CreateVersion7(), Guid.CreateVersion7(),
            GrossAmount: 1061.15m, ReceiptDateUtc: DateTime.UtcNow, VatAmount: 111.15m);

        await new DirectGoodsReceiptPostedIntegrationEventHandler(_posting, _resolver).HandleAsync(@event);

        await _posting.Received(1).PostSystemVoucherAsync(
            Arg.Is<PostVoucherRequest>(r => r.ReferenceType == "DirectGoodsReceipt" && Is(r, 950m, 111.15m, 1061.15m)),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DirectReceiptVoid_Should_Reverse_The_Posted_Voucher()
    {
        var receiptId = Guid.CreateVersion7();
        var voidedAt = DateTime.UtcNow;
        var @event = new DirectGoodsReceiptVoidedIntegrationEvent(
            Guid.NewGuid(), voidedAt, "t", "c", "Purchasing", receiptId, Guid.CreateVersion7(), 1061.15m,
            DateTime.UtcNow.AddDays(-1), "wrong supplier", "GRN-1", VoidedAtUtc: voidedAt);

        await new DirectGoodsReceiptVoidedIntegrationEventHandler(_posting).HandleAsync(@event);

        await _posting.Received(1).ReverseSystemVoucherAsync(
            "DirectGoodsReceipt", receiptId, Arg.Any<string>(), voidedAt, Arg.Any<CancellationToken>());
    }
}

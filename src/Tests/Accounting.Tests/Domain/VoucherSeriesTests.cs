using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Vat;

namespace Accounting.Tests.Domain;

/// <summary>Type-wise voucher series: each voucher type is numbered in its own series, with its own prefix.</summary>
public sealed class VoucherSeriesTests
{
    [Theory]
    [InlineData("system_sale", VoucherSeries.Sales)]
    [InlineData("system_sales_return", VoucherSeries.SalesReturn)]
    [InlineData("system_refund", VoucherSeries.SalesReturn)]
    // Also stock bought for cash / by bank without a supplier bill (OpeningStockReceivedIntegrationEventHandler).
    [InlineData("system_purchase", VoucherSeries.Purchase)]
    [InlineData("system_purchase_return", VoucherSeries.PurchaseReturn)]
    [InlineData("system_customer_payment", VoucherSeries.Receipt)]
    [InlineData("system_supplier_payment", VoucherSeries.Payment)]
    [InlineData("system_expense", VoucherSeries.Payment)]
    [InlineData("system_bank_deposit", VoucherSeries.Contra)]
    [InlineData("opening_balance", VoucherSeries.Opening)]
    [InlineData("system_opening_balance", VoucherSeries.Opening)]
    [InlineData("system_opening_stock", VoucherSeries.Opening)]
    [InlineData("system_inventory_adjustment", VoucherSeries.Journal)]
    [InlineData("system_stock_transfer", VoucherSeries.Journal)]
    [InlineData("system_consignment_settlement", VoucherSeries.Journal)]
    [InlineData("journal", VoucherSeries.Journal)]
    [InlineData(" system_sale ", VoucherSeries.Sales)]
    public void ForVoucherType_Should_MapEachTypeToItsSeries(string voucherType, string expected) =>
        VoucherSeries.ForVoucherType(voucherType).ShouldBe(expected);

    [Fact]
    public void ForVoucherType_Should_MapVatPayments_ToPayments() =>
        VoucherSeries.ForVoucherType(VatSettlement.VoucherType).ShouldBe(VoucherSeries.Payment);

    [Fact]
    public void ForVoucherType_Should_MapOpeningBalanceRulesType_ToOpening() =>
        VoucherSeries.ForVoucherType(OpeningBalanceRules.VoucherType).ShouldBe(VoucherSeries.Opening);

    [Theory]
    [InlineData("something_new")]
    [InlineData("")]
    [InlineData(null)]
    public void ForVoucherType_Should_FallBackToJournal_ForUnknownTypes(string? voucherType) =>
        VoucherSeries.ForVoucherType(voucherType).ShouldBe(VoucherSeries.Journal);

    [Theory]
    [InlineData(VoucherSeries.Sales, 1, "SAL-000001")]
    [InlineData(VoucherSeries.Payment, 123, "PMT-000123")]
    [InlineData(VoucherSeries.Opening, 1234567, "OB-1234567")]
    public void Format_Should_PrefixTheSeries_AndPadToSixDigits(string series, int number, string expected) =>
        VoucherSeries.Format(series, number).ShouldBe(expected);

    [Fact]
    public void All_Should_HaveDistinctPrefixes_ThatFitTheSeriesColumn()
    {
        VoucherSeries.All.Distinct(StringComparer.Ordinal).Count().ShouldBe(VoucherSeries.All.Count);
        VoucherSeries.All.ShouldAllBe(s => s.Length > 0 && s.Length <= 8);
        VoucherSeries.All.ShouldNotContain(AccountingVoucherSequence.LegacySeries);
    }
}

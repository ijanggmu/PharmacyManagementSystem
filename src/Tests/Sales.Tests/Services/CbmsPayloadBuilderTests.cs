using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services.Ird;
using Sales.Tests.Features;

namespace Sales.Tests.Services;

/// <summary>Golden JSON for the exact bodies IRD's CBMS receives on /api/bill and /api/billreturn.</summary>
public sealed class CbmsPayloadBuilderTests
{
    // 13 Oct 2026 06:00 UTC = 11:45 NPT = 2083 Ashwin 27.
    private static readonly DateTime IssuedUtc = new(2026, 10, 13, 6, 0, 0, DateTimeKind.Utc);
    private static readonly CbmsCredentials Credentials = new("pharma-api", "s3cret", "123456789");

    private static Sale CompletedSale(string? buyerName = null, string? buyerPan = null)
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.SetBuyer(buyerName, buyerPan);
        sale.AddItem(Guid.CreateVersion7(), 1m, 113m, 0m, 0m, 80m);                   // taxable, VAT-inclusive
        sale.AddItem(Guid.CreateVersion7(), 2m, 25m, 0m, 0m, 10m, isTaxable: false);  // exempt
        sale.Finalize("Cash", sale.TotalAmount);
        sale.ApplyVat(13m);
        sale.AssignInvoice("INV-MAIN-2083/84-00001", 2083);

        // SaleDateUtc is set to "now" by the domain; pin it for a deterministic invoice_date.
        using var db = SalesDbContextFactory.Create();
        db.Sales.Add(sale);
        db.Entry(sale).Property(nameof(Sale.SaleDateUtc)).CurrentValue = IssuedUtc;
        return sale;
    }

    [Fact]
    public void Bill_Should_Match_The_Cbms_Golden_Json()
    {
        var sale = CompletedSale(buyerName: "Ram Sharma", buyerPan: "987654321");

        string documentJson = CbmsPayloadBuilder.Serialize(CbmsPayloadBuilder.ForSale(sale, buyerName: "ignored customer"));
        string body = CbmsPayloadBuilder.ComposeRequest(documentJson, Credentials, isRealtime: true, IssuedUtc.AddSeconds(20));

        body.ShouldBe(
            "{\"username\":\"pharma-api\",\"password\":\"s3cret\",\"seller_pan\":\"123456789\"," +
            "\"buyer_pan\":\"987654321\",\"buyer_name\":\"Ram Sharma\",\"fiscal_year\":\"2083.084\"," +
            "\"invoice_number\":\"INV-MAIN-2083/84-00001\",\"invoice_date\":\"2083.06.27\"," +
            "\"total_sales\":163.00,\"taxable_sales_vat\":100.00,\"vat\":13.00," +
            "\"excisable_amount\":0.00,\"excise\":0.00,\"taxable_sales_hst\":0.00,\"hst\":0.00," +
            "\"amount_for_esf\":0.00,\"esf\":0.00,\"export_sales\":0.00,\"tax_exempted_sales\":50.00," +
            "\"isrealtime\":true,\"datetimeClient\":\"2026-10-13T11:45:20+05:45\"}");
    }

    [Fact]
    public void Bill_Should_Fall_Back_To_Customer_Name_And_Blank_Pan()
    {
        var sale = CompletedSale();

        var document = CbmsPayloadBuilder.ForSale(sale, buyerName: "Sita Customer");

        document.BuyerName.ShouldBe("Sita Customer");
        document.BuyerPan.ShouldBe(string.Empty);
    }

    [Fact]
    public void BillReturn_Should_Match_The_Cbms_Golden_Json()
    {
        var input = new CbmsReturnInput(
            RefInvoiceNumber: "INV-MAIN-2083/84-00001",
            CreditNoteNumber: "CN-MAIN-2083/84-00003",
            CreditNoteDateUtc: new DateTime(2026, 10, 14, 4, 30, 0, DateTimeKind.Utc), // 2083.06.28
            FiscalYearStart: 2083,
            Reason: "Damaged pack",
            Total: -113m, Taxable: -100m, Vat: -13m, Exempt: 0m, VatRatePercent: 13m,
            BuyerName: "Ram Sharma", BuyerPan: "987654321");

        string documentJson = CbmsPayloadBuilder.Serialize(CbmsPayloadBuilder.ForReturn(input));
        string body = CbmsPayloadBuilder.ComposeRequest(documentJson, Credentials, isRealtime: false, new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc));

        body.ShouldBe(
            "{\"username\":\"pharma-api\",\"password\":\"s3cret\",\"seller_pan\":\"123456789\"," +
            "\"buyer_pan\":\"987654321\",\"fiscal_year\":\"2083.084\",\"buyer_name\":\"Ram Sharma\"," +
            "\"ref_invoice_number\":\"INV-MAIN-2083/84-00001\",\"credit_note_number\":\"CN-MAIN-2083/84-00003\"," +
            "\"credit_note_date\":\"2083.06.28\",\"reason_for_return\":\"Damaged pack\"," +
            "\"total_sales\":113.00,\"taxable_sales_vat\":100.00,\"vat\":13.00," +
            "\"excisable_amount\":0.00,\"excise\":0.00,\"taxable_sales_hst\":0.00,\"hst\":0.00," +
            "\"amount_for_esf\":0.00,\"esf\":0.00,\"export_sales\":0.00,\"tax_exempted_sales\":0.00," +
            "\"isrealtime\":false,\"datetimeClient\":\"2026-10-15T05:45:00+05:45\"}");
    }

    [Fact]
    public void BillReturn_Should_Derive_Taxable_From_Vat_For_Records_Without_A_Breakdown()
    {
        var document = CbmsPayloadBuilder.ForReturn(new CbmsReturnInput(
            "INV-1", "CN-1", IssuedUtc, 2083, "", 163m, null, 13m, null, 13m, null, null));

        document.TaxableSalesVat.ShouldBe(100m);
        document.Vat.ShouldBe(13m);
        document.TaxExemptedSales.ShouldBe(50m);
        document.ReasonForReturn.ShouldBe("Sales return");
    }

    [Fact]
    public void ComposeRequest_Should_Never_Let_The_Stored_Document_Override_Credentials()
    {
        string tampered = "{\"username\":\"x\",\"password\":\"y\",\"invoice_number\":\"INV-1\",\"isrealtime\":true}";

        string body = CbmsPayloadBuilder.ComposeRequest(tampered, Credentials, isRealtime: false, IssuedUtc);

        body.ShouldStartWith("{\"username\":\"pharma-api\",\"password\":\"s3cret\",\"seller_pan\":\"123456789\",\"invoice_number\":\"INV-1\"");
        body.ShouldContain("\"isrealtime\":false");
    }

    [Theory]
    [InlineData(IrdDocumentType.Bill, "{\"invoice_number\":\"INV-1\"}", true)]
    [InlineData(IrdDocumentType.Bill, "{\"invoiceNumber\":\"INV-1\"}", false)]
    [InlineData(IrdDocumentType.Return, "{\"credit_note_number\":\"CN-1\"}", true)]
    [InlineData(IrdDocumentType.Bill, "not json", false)]
    public void IsCbmsDocument_Should_Recognise_The_Cbms_Shape(IrdDocumentType type, string json, bool expected) =>
        CbmsPayloadBuilder.IsCbmsDocument(json, type).ShouldBe(expected);

    [Theory]
    [InlineData(9_999.99, null, IrdInvoiceTypes.AbbreviatedTaxInvoice)]
    [InlineData(10_000, null, IrdInvoiceTypes.AbbreviatedTaxInvoice)]
    [InlineData(10_000.01, null, IrdInvoiceTypes.TaxInvoice)]
    [InlineData(500, "123456789", IrdInvoiceTypes.TaxInvoice)]
    public void InvoiceType_Should_Follow_The_Abbreviated_Threshold(double total, string? pan, string expected) =>
        IrdInvoiceTypes.For((decimal)total, pan, 10_000m).ShouldBe(expected);

    [Theory]
    [InlineData("123456789", true)]
    [InlineData(" 123456789 ", true)]
    [InlineData("12345678", false)]
    [InlineData("12345678A", false)]
    public void IrdPan_Should_Accept_Nine_Digits(string pan, bool expected) => IrdPan.IsValid(pan).ShouldBe(expected);

    [Fact]
    public void CbmsFiscalYear_Should_Use_Ird_Dotted_Form() => BikramSambat.CbmsFiscalYear(2083).ShouldBe("2083.084");
}

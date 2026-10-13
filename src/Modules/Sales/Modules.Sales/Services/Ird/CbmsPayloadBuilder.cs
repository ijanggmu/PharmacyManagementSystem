using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;

namespace FSH.Modules.Sales.Services.Ird;

/// <summary>
/// The bill fields of IRD's CBMS <c>POST /api/bill</c> body (BillViewModel), minus the credentials and the
/// dispatch-time fields, which <see cref="CbmsPayloadBuilder.ComposeRequest"/> adds. Amounts are NPR, 2 dp.
/// <c>total_sales</c> is the bill total including VAT (= taxable + VAT + exempt); excise, health service tax,
/// education service fee and export sales do not apply to a pharmacy and are always 0.
/// </summary>
public sealed record CbmsBillDocument(
    [property: JsonPropertyName("buyer_pan")] string BuyerPan,
    [property: JsonPropertyName("buyer_name")] string BuyerName,
    [property: JsonPropertyName("fiscal_year")] string FiscalYear,
    [property: JsonPropertyName("invoice_number")] string InvoiceNumber,
    [property: JsonPropertyName("invoice_date")] string InvoiceDate,
    [property: JsonPropertyName("total_sales")] decimal TotalSales,
    [property: JsonPropertyName("taxable_sales_vat")] decimal TaxableSalesVat,
    [property: JsonPropertyName("vat")] decimal Vat,
    [property: JsonPropertyName("excisable_amount")] decimal ExcisableAmount,
    [property: JsonPropertyName("excise")] decimal Excise,
    [property: JsonPropertyName("taxable_sales_hst")] decimal TaxableSalesHst,
    [property: JsonPropertyName("hst")] decimal Hst,
    [property: JsonPropertyName("amount_for_esf")] decimal AmountForEsf,
    [property: JsonPropertyName("esf")] decimal Esf,
    [property: JsonPropertyName("export_sales")] decimal ExportSales,
    [property: JsonPropertyName("tax_exempted_sales")] decimal TaxExemptedSales);

/// <summary>The credit-note fields of CBMS <c>POST /api/billreturn</c> (BillReturnViewModel), minus credentials and
/// dispatch-time fields. Amounts are the (positive) value credited.</summary>
public sealed record CbmsBillReturnDocument(
    [property: JsonPropertyName("buyer_pan")] string BuyerPan,
    [property: JsonPropertyName("fiscal_year")] string FiscalYear,
    [property: JsonPropertyName("buyer_name")] string BuyerName,
    [property: JsonPropertyName("ref_invoice_number")] string RefInvoiceNumber,
    [property: JsonPropertyName("credit_note_number")] string CreditNoteNumber,
    [property: JsonPropertyName("credit_note_date")] string CreditNoteDate,
    [property: JsonPropertyName("reason_for_return")] string ReasonForReturn,
    [property: JsonPropertyName("total_sales")] decimal TotalSales,
    [property: JsonPropertyName("taxable_sales_vat")] decimal TaxableSalesVat,
    [property: JsonPropertyName("vat")] decimal Vat,
    [property: JsonPropertyName("excisable_amount")] decimal ExcisableAmount,
    [property: JsonPropertyName("excise")] decimal Excise,
    [property: JsonPropertyName("taxable_sales_hst")] decimal TaxableSalesHst,
    [property: JsonPropertyName("hst")] decimal Hst,
    [property: JsonPropertyName("amount_for_esf")] decimal AmountForEsf,
    [property: JsonPropertyName("esf")] decimal Esf,
    [property: JsonPropertyName("export_sales")] decimal ExportSales,
    [property: JsonPropertyName("tax_exempted_sales")] decimal TaxExemptedSales);

/// <summary>The CBMS API user issued by IRD and the seller's PAN, resolved from the tenant's settings at dispatch.</summary>
public sealed record CbmsCredentials(string Username, string Password, string SellerPan);

/// <summary>What a credit note (return, refund or cancellation) reports to CBMS.</summary>
public sealed record CbmsReturnInput(
    string RefInvoiceNumber,
    string CreditNoteNumber,
    DateTime CreditNoteDateUtc,
    int FiscalYearStart,
    string Reason,
    decimal Total,
    decimal? Taxable,
    decimal? Vat,
    decimal? Exempt,
    decimal? VatRatePercent,
    string? BuyerName,
    string? BuyerPan);

/// <summary>
/// Builds the exact JSON IRD's CBMS expects. Documents are built (and queued) when a bill or credit note is issued;
/// <see cref="ComposeRequest"/> wraps one into the request body at dispatch with the credentials, <c>isrealtime</c>
/// and <c>datetimeClient</c>, in the field order of IRD's API specification.
/// </summary>
public static class CbmsPayloadBuilder
{
    private const int MaxReasonLength = 500;
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    // Relaxed escaping: the body is JSON over HTTP, never embedded in HTML, so "+05:45" and Devanagari buyer names
    // are sent as-is instead of \u escapes.
    private static readonly JsonSerializerOptions DocumentOptions = new()
    {
        WriteIndented = false,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>0.00 — every amount is sent with exactly two decimals.</summary>
    private static readonly decimal Zero = Amount(0m);

    /// <summary>Rounded to the paisa and always carrying two decimals, so the JSON reads 163.00, never 163.</summary>
    private static decimal Amount(decimal value) => Money.Round(value) + 0.00m;

    /// <summary>The CBMS bill for a completed (or since-cancelled) sale. Requires the sale's invoice number.</summary>
    public static CbmsBillDocument ForSale(Sale sale, string? buyerName)
    {
        ArgumentNullException.ThrowIfNull(sale);
        string invoiceNumber = sale.InvoiceNumber
            ?? throw new InvalidOperationException($"Sale {sale.Id} has no invoice number to report to IRD.");

        decimal total = Amount(sale.TotalAmount);
        var (taxable, vat, exempt) = Split(total, sale.TaxableAmount, sale.VatAmount, sale.ExemptAmount, sale.VatRatePercent);
        int fiscalYear = sale.FiscalYear ?? NepalFiscalYear.StartYearFor(sale.SaleDateUtc);

        return new CbmsBillDocument(
            BuyerPan: sale.BuyerPan ?? string.Empty,
            BuyerName: (sale.BuyerName ?? buyerName ?? string.Empty).Trim(),
            FiscalYear: BikramSambat.CbmsFiscalYear(fiscalYear),
            InvoiceNumber: invoiceNumber,
            InvoiceDate: BikramSambat.FormatUtc(sale.SaleDateUtc),
            TotalSales: total,
            TaxableSalesVat: taxable,
            Vat: vat,
            ExcisableAmount: Zero,
            Excise: Zero,
            TaxableSalesHst: Zero,
            Hst: Zero,
            AmountForEsf: Zero,
            Esf: Zero,
            ExportSales: Zero,
            TaxExemptedSales: exempt);
    }

    public static CbmsBillReturnDocument ForReturn(CbmsReturnInput input)
    {
        ArgumentNullException.ThrowIfNull(input);

        decimal total = Amount(Math.Abs(input.Total));
        var (taxable, vat, exempt) = Split(
            total, Abs(input.Taxable), Abs(input.Vat), Abs(input.Exempt), input.VatRatePercent);
        string reason = string.IsNullOrWhiteSpace(input.Reason) ? "Sales return" : input.Reason.Trim();

        return new CbmsBillReturnDocument(
            BuyerPan: input.BuyerPan?.Trim() ?? string.Empty,
            FiscalYear: BikramSambat.CbmsFiscalYear(input.FiscalYearStart),
            BuyerName: input.BuyerName?.Trim() ?? string.Empty,
            RefInvoiceNumber: input.RefInvoiceNumber,
            CreditNoteNumber: input.CreditNoteNumber,
            CreditNoteDate: BikramSambat.FormatUtc(input.CreditNoteDateUtc),
            ReasonForReturn: reason.Length <= MaxReasonLength ? reason : reason[..MaxReasonLength],
            TotalSales: total,
            TaxableSalesVat: taxable,
            Vat: vat,
            ExcisableAmount: Zero,
            Excise: Zero,
            TaxableSalesHst: Zero,
            Hst: Zero,
            AmountForEsf: Zero,
            Esf: Zero,
            ExportSales: Zero,
            TaxExemptedSales: exempt);
    }

    public static string Serialize(CbmsBillDocument document) => JsonSerializer.Serialize(document, DocumentOptions);

    public static string Serialize(CbmsBillReturnDocument document) => JsonSerializer.Serialize(document, DocumentOptions);

    /// <summary>True when <paramref name="payloadJson"/> is a CBMS document of the given type (queue rows written
    /// before CBMS-shaped payloads are not, and are rebuilt from the sale at dispatch).</summary>
    public static bool IsCbmsDocument(string payloadJson, IrdDocumentType type)
    {
        try
        {
            return JsonNode.Parse(payloadJson) is JsonObject obj
                && obj.ContainsKey(type == IrdDocumentType.Bill ? "invoice_number" : "credit_note_number");
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>
    /// The request body: <c>username</c>, <c>password</c>, <c>seller_pan</c>, then the document's fields in order,
    /// then <c>isrealtime</c> and <c>datetimeClient</c> (Nepal time, ISO 8601 with offset).
    /// </summary>
    public static string ComposeRequest(string documentJson, CbmsCredentials credentials, bool isRealtime, DateTime clientUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(documentJson);
        ArgumentNullException.ThrowIfNull(credentials);

        if (JsonNode.Parse(documentJson) is not JsonObject document)
        {
            throw new InvalidOperationException("The queued IRD document is not a JSON object.");
        }

        var body = new JsonObject
        {
            ["username"] = credentials.Username,
            ["password"] = credentials.Password,
            ["seller_pan"] = credentials.SellerPan,
        };

        foreach (var (name, value) in document)
        {
            if (name is "username" or "password" or "seller_pan" or "isrealtime" or "datetimeClient")
            {
                continue;
            }

            body[name] = value?.DeepClone();
        }

        body["isrealtime"] = isRealtime;
        body["datetimeClient"] = FormatClientTime(clientUtc);
        return body.ToJsonString(DocumentOptions);
    }

    /// <summary>"2026-10-13T15:45:00+05:45".</summary>
    public static string FormatClientTime(DateTime utc) =>
        new DateTimeOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc)).ToOffset(NepalOffset)
            .ToString("yyyy-MM-dd'T'HH:mm:sszzz", CultureInfo.InvariantCulture);

    /// <summary>Taxable / VAT / exempt split, from the stored breakdown or derived from the VAT for older records.
    /// An unknown VAT reports the whole amount as exempt rather than inventing tax.</summary>
    private static (decimal Taxable, decimal Vat, decimal Exempt) Split(
        decimal total, decimal? storedTaxable, decimal? vatAmount, decimal? storedExempt, decimal? ratePercent)
    {
        var (taxable, exempt) = GetIrdSalesRegisterQueryHandler.VatBreakdown(total, vatAmount, storedTaxable, storedExempt, ratePercent);
        if (taxable is null || vatAmount is null)
        {
            return (Zero, Zero, Amount(total));
        }

        return (Amount(taxable.Value), Amount(vatAmount.Value), Amount(exempt ?? 0m));
    }

    private static decimal? Abs(decimal? value) => value is { } v ? Math.Abs(v) : null;
}

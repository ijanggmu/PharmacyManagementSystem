using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>
/// Adds an asset to the fixed asset register and posts its acquisition (dated <paramref name="AcquisitionDateUtc"/>).
/// <paramref name="Amount"/> is the bill total; for a VAT bill <paramref name="VatAmount"/> is the input VAT inside it
/// (claimed as Input VAT Recoverable, so the asset's cost is <c>Amount − VatAmount</c>).
/// <list type="bullet">
/// <item><paramref name="Source"/> <c>cash_bank</c> — Dr Fixed Assets 1550 (+ Dr Input VAT 1150) / Cr the money account
/// <paramref name="PaymentMethod"/> maps to.</item>
/// <item><c>supplier</c> — pay later to <paramref name="SupplierId"/>: Cr Accounts Payable 2000, and the bill goes on the
/// supplier's AP ledger (paid through the normal supplier payment flow).</item>
/// <item><c>opening</c> — owned before go-live: Dr Fixed Assets (cost) / Cr Accumulated Depreciation 1590
/// (<paramref name="OpeningAccumulatedDepreciation"/>) / Cr Owner's Equity 3000 (net), dated
/// <paramref name="DepreciationStartDateUtc"/> (the go-live date). Depreciation starts in that month; the months before
/// are covered by the depreciation to date. <paramref name="OpeningTaxWrittenDownValue"/> is the asset's share of its
/// tax pool's written-down value at the start of that fiscal year (defaults to its net book value).</item>
/// </list>
/// Book depreciation: <paramref name="DepreciationMethod"/> <c>straight_line</c> needs
/// <paramref name="UsefulLifeMonths"/>; <c>written_down_value</c> needs <paramref name="RatePercent"/> (per year).
/// Tax: <paramref name="TaxPool"/> A–E (Schedule 2); pool E (intangibles) needs <paramref name="TaxUsefulLifeYears"/>.
/// Returns the asset id.
/// </summary>
public sealed record CreateFixedAssetCommand(
    string Name,
    string Category,
    DateTime AcquisitionDateUtc,
    decimal Amount,
    string Source,
    string DepreciationMethod,
    string TaxPool,
    decimal VatAmount = 0m,
    decimal ResidualValue = 0m,
    int? UsefulLifeMonths = null,
    decimal? RatePercent = null,
    int? TaxUsefulLifeYears = null,
    string? PaymentMethod = null,
    Guid? SupplierId = null,
    string? VendorName = null,
    string? SupplierVatNumber = null,
    string? BillNumber = null,
    string? AssetTag = null,
    string? Location = null,
    Guid? BranchId = null,
    decimal OpeningAccumulatedDepreciation = 0m,
    DateTime? DepreciationStartDateUtc = null,
    decimal? OpeningTaxWrittenDownValue = null,
    string? Notes = null) : ICommand<Guid>;

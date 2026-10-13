using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.FixedAssets;

/// <summary>Voucher types and references of the fixed asset flows, and the API's string values ↔ domain enums.</summary>
public static class FixedAssetVouchers
{
    /// <summary>Buying an asset (paid now or on credit) — JV series.</summary>
    public const string AcquisitionVoucherType = "system_asset_acquisition";

    /// <summary>An asset owned before go-live — OB series.</summary>
    public const string OpeningVoucherType = "system_asset_opening";

    /// <summary>A sale or write-off — JV series.</summary>
    public const string DisposalVoucherType = "system_asset_disposal";

    /// <summary>Reference of the acquisition voucher (id = asset id).</summary>
    public const string ReferenceType = "FixedAsset";

    /// <summary>Reference of the disposal voucher (id = asset id).</summary>
    public const string DisposalReferenceType = "FixedAssetDisposal";

    public static FixedAssetDepreciationMethod? ParseMethod(string? value) =>
        value?.Trim().ToUpperInvariant() switch
        {
            "STRAIGHT_LINE" => FixedAssetDepreciationMethod.StraightLine,
            "WRITTEN_DOWN_VALUE" => FixedAssetDepreciationMethod.WrittenDownValue,
            _ => null,
        };

    public static FixedAssetAcquisitionSource? ParseSource(string? value) =>
        value?.Trim().ToUpperInvariant() switch
        {
            "CASH_BANK" => FixedAssetAcquisitionSource.CashBank,
            "SUPPLIER" => FixedAssetAcquisitionSource.Supplier,
            "OPENING" => FixedAssetAcquisitionSource.Opening,
            _ => null,
        };

    public static FixedAssetDisposalKind? ParseDisposalKind(string? value) =>
        value?.Trim().ToUpperInvariant() switch
        {
            "SALE" => FixedAssetDisposalKind.Sale,
            "WRITE_OFF" => FixedAssetDisposalKind.WriteOff,
            _ => null,
        };

    public static string ToValue(FixedAssetDepreciationMethod method) =>
        method == FixedAssetDepreciationMethod.StraightLine
            ? FixedAssetValues.Methods.StraightLine
            : FixedAssetValues.Methods.WrittenDownValue;

    public static string ToValue(FixedAssetAcquisitionSource source) =>
        source switch
        {
            FixedAssetAcquisitionSource.CashBank => FixedAssetValues.Sources.CashBank,
            FixedAssetAcquisitionSource.Supplier => FixedAssetValues.Sources.Supplier,
            _ => FixedAssetValues.Sources.Opening,
        };

    public static string ToValue(FixedAssetDisposalKind kind) =>
        kind == FixedAssetDisposalKind.Sale ? FixedAssetValues.DisposalKinds.Sale : FixedAssetValues.DisposalKinds.WriteOff;
}

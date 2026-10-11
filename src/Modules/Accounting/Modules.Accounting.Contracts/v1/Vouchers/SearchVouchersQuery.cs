using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Vouchers;

/// <summary>Paged voucher register search. Every filter is applied server-side so paging stays correct.
/// <list type="bullet">
/// <item><paramref name="Search"/> — case-insensitive match on voucher no, narration or reference type.</item>
/// <item><paramref name="Status"/> — one of <see cref="VoucherStatusFilters"/> (case-insensitive).</item>
/// <item><paramref name="VoucherType"/> — exact type; a reversal also matches the type of the voucher it reverses.</item>
/// <item><paramref name="Source"/> — <c>manual</c> (manual journals: Source=Manual and type "journal", which includes
/// reversals) or <c>system</c> (everything else).</item>
/// </list></summary>
public sealed record SearchVouchersQuery(
    string? Search = null,
    string? Status = null,
    string? VoucherType = null,
    DateTime? DateFromUtc = null,
    DateTime? DateToUtc = null,
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50,
    string? Source = null) : IQuery<PagedResponse<AccountingVoucherDto>>;

/// <summary>Status filter values accepted by <see cref="SearchVouchersQuery.Status"/>.</summary>
public static class VoucherStatusFilters
{
    public const string Draft = "draft";
    public const string Posted = "posted";

    /// <summary>Every void voucher — voided outright or reversed.</summary>
    public const string Void = "void";

    /// <summary>Void vouchers that were reversed (a reversing voucher points back at them).</summary>
    public const string Reversed = "reversed";

    /// <summary>Void vouchers voided outright, without a reversing voucher.</summary>
    public const string Voided = "voided";

    /// <summary>Reversing vouchers (any status) — vouchers that reverse another one.</summary>
    public const string Reversal = "reversal";

    public static readonly IReadOnlyList<string> All = [Draft, Posted, Void, Reversed, Voided, Reversal];
}

/// <summary>Source filter values accepted by <see cref="SearchVouchersQuery.Source"/>.</summary>
public static class VoucherSourceFilters
{
    public const string Manual = "manual";
    public const string System = "system";

    public static readonly IReadOnlyList<string> All = [Manual, System];
}

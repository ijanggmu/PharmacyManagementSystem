using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>
/// Sells (<paramref name="Kind"/> <c>sale</c>) or writes off (<c>write_off</c>) an asset on
/// <paramref name="DisposalDateUtc"/>: Dr Accumulated Depreciation (to date) + Dr the money account for
/// <paramref name="PaymentMethod"/> (<paramref name="Proceeds"/>, VAT-exclusive) + Dr Loss on Disposal 5950 / Cr Fixed
/// Assets (cost) + Cr Gain on Disposal 4950. Depreciation must be posted for every month before the disposal month
/// (none is charged for the disposal month itself); a 409 names the month to run first. A date in a locked period is
/// refused. Returns the disposal voucher id.
/// </summary>
public sealed record DisposeFixedAssetCommand(
    Guid Id,
    DateTime DisposalDateUtc,
    string Kind,
    decimal Proceeds = 0m,
    string? PaymentMethod = null,
    string? Notes = null) : ICommand<Guid>;

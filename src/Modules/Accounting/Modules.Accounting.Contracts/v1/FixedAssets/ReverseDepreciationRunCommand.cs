using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>Reverses a depreciation run (to re-run it after correcting an asset): its voucher is reversed and its asset
/// months become unposted again. Refused when any of its assets has a later posted month or has been disposed, and when
/// the run's period is locked. Returns the reversing voucher id.</summary>
public sealed record ReverseDepreciationRunCommand(Guid RunId) : ICommand<Guid>;

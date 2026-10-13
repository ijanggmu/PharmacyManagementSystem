using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FixedAssets;

/// <summary>Removes an asset entered by mistake: reverses its acquisition voucher (and credits a pay-later bill back
/// on the supplier's ledger). Refused once depreciation has been posted for it, once it is disposed, or when its
/// supplier bill has been paid.</summary>
public sealed record DeleteFixedAssetCommand(Guid Id) : ICommand<Guid>;

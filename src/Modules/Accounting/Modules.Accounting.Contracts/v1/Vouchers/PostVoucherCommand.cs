using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Vouchers;

public sealed record PostVoucherCommand(Guid VoucherId) : ICommand<Guid>;

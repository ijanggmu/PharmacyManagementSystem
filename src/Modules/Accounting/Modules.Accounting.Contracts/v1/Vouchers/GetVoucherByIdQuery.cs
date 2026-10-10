using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Vouchers;

public sealed record GetVoucherByIdQuery(Guid VoucherId) : IQuery<AccountingVoucherDto>;

using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

public sealed record GetBankStatementImportByIdQuery(Guid ImportId) : IQuery<BankStatementImportDto>;

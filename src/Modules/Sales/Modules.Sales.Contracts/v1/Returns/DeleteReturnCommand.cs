using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Returns;

public sealed record DeleteReturnCommand(Guid ReturnId) : ICommand<Guid>;

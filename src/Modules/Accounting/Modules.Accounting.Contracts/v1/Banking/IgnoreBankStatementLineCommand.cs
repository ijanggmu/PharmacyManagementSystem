using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

/// <summary>Marks a statement line as deliberately not expected in the GL (e.g. an inter-account
/// transfer already booked elsewhere). Ignored lines drop out of the difference calculation but
/// stay visible.</summary>
public sealed record IgnoreBankStatementLineCommand(Guid LineId, string? Note) : ICommand<Guid>;

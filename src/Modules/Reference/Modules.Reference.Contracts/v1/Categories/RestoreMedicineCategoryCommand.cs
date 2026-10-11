using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Categories;

public sealed record RestoreMedicineCategoryCommand(Guid CategoryId) : ICommand<Guid>;

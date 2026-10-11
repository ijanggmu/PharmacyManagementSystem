using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Categories;

public sealed record DeleteMedicineCategoryCommand(Guid CategoryId) : ICommand<Unit>;

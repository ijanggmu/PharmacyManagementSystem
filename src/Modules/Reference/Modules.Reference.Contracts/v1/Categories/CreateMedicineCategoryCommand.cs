using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Categories;

public sealed record CreateMedicineCategoryCommand(
    string Name,
    string? Description = null,
    Guid? ParentCategoryId = null) : ICommand<Guid>;

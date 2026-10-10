using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Categories;

public sealed record UpdateMedicineCategoryCommand(
    Guid CategoryId,
    string Name,
    string? Description = null,
    Guid? ParentCategoryId = null) : ICommand<Guid>;

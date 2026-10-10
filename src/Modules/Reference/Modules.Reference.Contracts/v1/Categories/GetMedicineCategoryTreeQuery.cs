using FSH.Modules.Reference.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Categories;

public sealed record GetMedicineCategoryTreeQuery : IQuery<IReadOnlyList<MedicineCategoryTreeNodeDto>>;

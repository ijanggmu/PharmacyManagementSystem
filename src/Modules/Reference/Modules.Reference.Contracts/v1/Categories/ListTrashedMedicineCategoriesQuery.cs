using FSH.Framework.Shared.Persistence;
using FSH.Modules.Reference.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Categories;

public sealed record ListTrashedMedicineCategoriesQuery(int PageNumber = 1, int PageSize = 20)
    : IQuery<PagedResponse<MedicineCategoryDto>>;

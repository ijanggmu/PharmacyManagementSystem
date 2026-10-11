using FSH.Framework.Shared.Persistence;
using FSH.Modules.Reference.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Categories;

/// <summary>
/// Search for medicine categories with pagination and sorting.
/// </summary>
/// <param name="Search">Search term.</param>
/// <param name="ParentCategoryId">Optional parent category ID filter.</param>
/// <param name="PageNumber">Page number.</param>
/// <param name="PageSize">Page size.</param>
/// <param name="SortBy">Sort column. One of: name | slug | createdAtUtc.</param>
/// <param name="SortDir">Sort direction. One of: asc | desc.</param>
public sealed record SearchMedicineCategoriesQuery(
    string? Search = null,
    Guid? ParentCategoryId = null,
    int PageNumber = 1,
    int PageSize = 50,
    string? SortBy = null,
    string? SortDir = null) : IQuery<PagedResponse<MedicineCategoryDto>>;

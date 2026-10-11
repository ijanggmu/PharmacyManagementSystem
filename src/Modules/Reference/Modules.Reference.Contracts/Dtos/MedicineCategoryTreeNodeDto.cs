namespace FSH.Modules.Reference.Contracts.Dtos;

public sealed record MedicineCategoryTreeNodeDto(
    Guid Id,
    string Name,
    string Slug,
    string? Description,
    IReadOnlyList<MedicineCategoryTreeNodeDto> Children);

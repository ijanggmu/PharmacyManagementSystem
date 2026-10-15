using Finbuckle.MultiTenant.Abstractions;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranches;
using FSH.Modules.Multitenancy.Data;
using FSH.Modules.Multitenancy.Domain;
using FSH.Modules.Multitenancy.Features.v1.GetBranches;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Multitenancy.Services;

public sealed class BranchService : IBranchService
{
    private readonly TenantDbContext _dbContext;
    private readonly IMultiTenantContextAccessor<AppTenantInfo> _tenantAccessor;

    public BranchService(TenantDbContext dbContext, IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor)
    {
        _dbContext = dbContext;
        _tenantAccessor = tenantAccessor;
    }

    public Task<BranchDto> CreateAsync(string name, string code, CancellationToken cancellationToken = default) =>
        CreateAsync(name, code, null, null, null, cancellationToken);

    public async Task<BranchDto> CreateAsync(
        string name, string code, string? address, string? phone, string? email,
        CancellationToken cancellationToken = default)
    {
        var tenantId = GetCurrentTenantId();

        if (await ExistsWithCodeAsync(code, null, cancellationToken).ConfigureAwait(false))
        {
            throw new CustomException($"A branch with code '{code}' already exists for this tenant.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // The tenant's first branch is automatically the default — CreateTenant does not seed a branch
        // itself, so this is where "first-created branch is default" actually takes effect.
        bool isFirstBranch = !await _dbContext.Branches
            .AsNoTracking()
            .AnyAsync(b => b.TenantId == tenantId, cancellationToken)
            .ConfigureAwait(false);

        var branch = Branch.Create(tenantId, name, code, null, address, phone, email, isFirstBranch);
        _dbContext.Branches.Add(branch);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return MapToDto(branch);
    }

    public Task<BranchDto> UpdateAsync(Guid id, string name, string code, bool isActive, CancellationToken cancellationToken = default) =>
        UpdateAsync(id, name, code, isActive, null, null, null, cancellationToken);

    public async Task<BranchDto> UpdateAsync(
        Guid id, string name, string code, bool isActive, string? address, string? phone, string? email,
        CancellationToken cancellationToken = default)
    {
        var tenantId = GetCurrentTenantId();

        var branch = await _dbContext.Branches
            .FirstOrDefaultAsync(b => b.Id == id && b.TenantId == tenantId, cancellationToken)
            .ConfigureAwait(false);

        _ = branch ?? throw new NotFoundException($"Branch {id} not found");

        if (await ExistsWithCodeAsync(code, id, cancellationToken).ConfigureAwait(false))
        {
            throw new CustomException($"A branch with code '{code}' already exists for this tenant.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // The edit form carries the Active switch, so it must pass the same guards as Deactivate.
        if (branch.IsActive && !isActive)
        {
            await EnsureCanDeactivateAsync(id, tenantId, cancellationToken).ConfigureAwait(false);
        }

        branch.Update(name, code, isActive, null, address, phone, email);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return MapToDto(branch);
    }

    public async Task<BranchDto> DeactivateAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var tenantId = GetCurrentTenantId();

        var branch = await _dbContext.Branches
            .FirstOrDefaultAsync(b => b.Id == id && b.TenantId == tenantId, cancellationToken)
            .ConfigureAwait(false);

        _ = branch ?? throw new NotFoundException($"Branch {id} not found");

        if (!branch.IsActive)
        {
            return MapToDto(branch);
        }

        await EnsureCanDeactivateAsync(id, tenantId, cancellationToken).ConfigureAwait(false);

        branch.Deactivate(null);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return MapToDto(branch);
    }

    private async Task EnsureCanDeactivateAsync(Guid id, string tenantId, CancellationToken cancellationToken)
    {
        if (await GetDefaultBranchIdAsync(cancellationToken).ConfigureAwait(false) == id)
        {
            throw new CustomException(
                "The tenant default branch cannot be deactivated.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        int activeCount = await _dbContext.Branches
            .AsNoTracking()
            .CountAsync(b => b.TenantId == tenantId && b.IsActive, cancellationToken)
            .ConfigureAwait(false);
        if (activeCount <= 1)
        {
            throw new CustomException(
                "At least one active branch must remain.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }

    public async Task<BranchDto> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var tenantId = GetCurrentTenantId();

        var branch = await _dbContext.Branches
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.Id == id && b.TenantId == tenantId, cancellationToken)
            .ConfigureAwait(false);

        _ = branch ?? throw new NotFoundException($"Branch {id} not found");

        return MapToDto(branch);
    }

    public async Task<PagedResponse<BranchDto>> GetAllAsync(GetBranchesQuery query, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);

        var tenantId = GetCurrentTenantId();
        var specification = new GetBranchesSpecification(query, tenantId);
        IQueryable<BranchDto> projected = _dbContext.Branches.ApplySpecification(specification);

        return await projected
            .ToPagedResponseAsync(query, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<bool> ExistsWithCodeAsync(string code, Guid? exceptId = null, CancellationToken cancellationToken = default)
    {
        var tenantId = GetCurrentTenantId();

        return await _dbContext.Branches
            .AsNoTracking()
            .AnyAsync(
                b => b.TenantId == tenantId &&
                     b.Code == code &&
                     (!exceptId.HasValue || b.Id != exceptId.Value),
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<BranchDto>> GetAllForCurrentTenantAsync(CancellationToken cancellationToken = default)
    {
        var tenantId = GetCurrentTenantId();

        return await _dbContext.Branches
            .AsNoTracking()
            .Where(b => b.TenantId == tenantId)
            .OrderBy(b => b.Name)
            .Select(b => new BranchDto
            {
                Id = b.Id,
                TenantId = b.TenantId,
                Name = b.Name,
                Code = b.Code,
                IsActive = b.IsActive,
                IsDefault = b.IsDefault,
                CreatedOnUtc = b.CreatedOnUtc,
                LastModifiedOnUtc = b.LastModifiedOnUtc
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<bool> IsActiveBranchOfCurrentTenantAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var tenantId = GetCurrentTenantId();

        return await _dbContext.Branches
            .AsNoTracking()
            .AnyAsync(b => b.Id == id && b.TenantId == tenantId && b.IsActive, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<Guid?> GetDefaultBranchIdAsync(CancellationToken cancellationToken = default)
    {
        var tenantId = GetCurrentTenantId();

        // Prefer the explicitly flagged default. Existing tenants from before IsDefault existed have no
        // flagged row, so fall back to oldest-by-CreatedOnUtc — the behavior this replaces — to avoid
        // breaking already-running data (e.g. the demo pharmacy).
        var flagged = await _dbContext.Branches
            .AsNoTracking()
            .Where(b => b.TenantId == tenantId && b.IsDefault)
            .Select(b => (Guid?)b.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (flagged is not null)
        {
            return flagged;
        }

        return await _dbContext.Branches
            .AsNoTracking()
            .Where(b => b.TenantId == tenantId)
            .OrderBy(b => b.CreatedOnUtc)
            .Select(b => (Guid?)b.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
    }

    private string GetCurrentTenantId() =>
        _tenantAccessor.MultiTenantContext?.TenantInfo?.Id
            ?? throw new UnauthorizedException("invalid tenant");

    private static BranchDto MapToDto(Branch branch) => new()
    {
        Id = branch.Id,
        TenantId = branch.TenantId,
        Name = branch.Name,
        Code = branch.Code,
        IsActive = branch.IsActive,
        IsDefault = branch.IsDefault,
        CreatedOnUtc = branch.CreatedOnUtc,
        LastModifiedOnUtc = branch.LastModifiedOnUtc,
        Address = branch.Address,
        Phone = branch.Phone,
        Email = branch.Email
    };
}

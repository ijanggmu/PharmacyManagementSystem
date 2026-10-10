using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranches;
using FSH.Modules.Multitenancy.Data;
using FSH.Modules.Multitenancy.Services;
using NSubstitute;

namespace Multitenancy.Tests.Features.Branches;

public sealed class BranchServiceTests
{
    private const string TenantA = "tenant-a";
    private const string TenantB = "tenant-b";

    private readonly TenantDbContext _db;
    private readonly BranchService _sut;

    public BranchServiceTests()
    {
        _db = TenantDbContextFactory.Create();
        _sut = new BranchService(_db, CreateAccessor(TenantA));
    }

    private static IMultiTenantContextAccessor<AppTenantInfo> CreateAccessor(string tenantId)
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo(tenantId, tenantId)));
        return accessor;
    }

    #region Happy Path

    [Fact]
    public async Task CreateAsync_Should_PersistBranch_And_ReturnDto()
    {
        // Act
        var result = await _sut.CreateAsync("Main Branch", "MAIN", CancellationToken.None);

        // Assert
        result.Id.ShouldNotBe(Guid.Empty);
        result.TenantId.ShouldBe(TenantA);
        result.Name.ShouldBe("Main Branch");
        result.Code.ShouldBe("MAIN");
        result.IsActive.ShouldBeTrue();
    }

    [Fact]
    public async Task UpdateAsync_Should_UpdateFields()
    {
        // Arrange
        var created = await _sut.CreateAsync("Main Branch", "MAIN", CancellationToken.None);

        // Act
        var updated = await _sut.UpdateAsync(created.Id, "Renamed Branch", "MAIN2", false, CancellationToken.None);

        // Assert
        updated.Name.ShouldBe("Renamed Branch");
        updated.Code.ShouldBe("MAIN2");
        updated.IsActive.ShouldBeFalse();
    }

    [Fact]
    public async Task GetByIdAsync_Should_ReturnBranch_When_BelongsToCurrentTenant()
    {
        // Arrange
        var created = await _sut.CreateAsync("Main Branch", "MAIN", CancellationToken.None);

        // Act
        var result = await _sut.GetByIdAsync(created.Id, CancellationToken.None);

        // Assert
        result.Id.ShouldBe(created.Id);
    }

    [Fact]
    public async Task GetAllAsync_Should_ReturnOnlyCurrentTenantBranches()
    {
        // Arrange — one branch for tenant A (via _sut), one for tenant B (via a second service instance).
        await _sut.CreateAsync("Main Branch", "MAIN", CancellationToken.None);
        var otherTenantService = new BranchService(_db, CreateAccessor(TenantB));
        await otherTenantService.CreateAsync("Other Branch", "OTHER", CancellationToken.None);

        // Act
        var page = await _sut.GetAllAsync(new GetBranchesQuery(), CancellationToken.None);

        // Assert
        page.Items.ShouldHaveSingleItem();
        page.Items.Single().Code.ShouldBe("MAIN");
    }

    [Fact]
    public async Task GetAllForCurrentTenantAsync_Should_ReturnAllBranches_IncludingInactive()
    {
        // Arrange
        var created = await _sut.CreateAsync("Main Branch", "MAIN", CancellationToken.None);
        await _sut.UpdateAsync(created.Id, created.Name, created.Code, false, CancellationToken.None);
        await _sut.CreateAsync("Second Branch", "SECOND", CancellationToken.None);

        // Act
        var all = await _sut.GetAllForCurrentTenantAsync(CancellationToken.None);

        // Assert
        all.Count.ShouldBe(2);
    }

    [Fact]
    public async Task IsActiveBranchOfCurrentTenantAsync_Should_ReturnTrue_When_ActiveAndOwnedByTenant()
    {
        // Arrange
        var created = await _sut.CreateAsync("Main Branch", "MAIN", CancellationToken.None);

        // Act
        var result = await _sut.IsActiveBranchOfCurrentTenantAsync(created.Id, CancellationToken.None);

        // Assert
        result.ShouldBeTrue();
    }

    #endregion

    #region Guards / Edge Cases

    [Fact]
    public async Task CreateAsync_Should_Throw_When_CodeAlreadyExistsForTenant()
    {
        // Arrange
        await _sut.CreateAsync("Main Branch", "MAIN", CancellationToken.None);

        // Act
        var act = () => _sut.CreateAsync("Duplicate", "MAIN", CancellationToken.None);

        // Assert
        await Should.ThrowAsync<CustomException>(act);
    }

    [Fact]
    public async Task UpdateAsync_Should_Throw_When_BranchNotFound()
    {
        // Act
        var act = () => _sut.UpdateAsync(Guid.NewGuid(), "Name", "CODE", true, CancellationToken.None);

        // Assert
        await Should.ThrowAsync<NotFoundException>(act);
    }

    [Fact]
    public async Task GetByIdAsync_Should_Throw_When_BranchBelongsToDifferentTenant()
    {
        // Arrange — branch created under tenant B, looked up through the tenant-A-scoped _sut.
        var otherTenantService = new BranchService(_db, CreateAccessor(TenantB));
        var created = await otherTenantService.CreateAsync("Other Branch", "OTHER", CancellationToken.None);

        // Act
        var act = () => _sut.GetByIdAsync(created.Id, CancellationToken.None);

        // Assert
        await Should.ThrowAsync<NotFoundException>(act);
    }

    [Fact]
    public async Task IsActiveBranchOfCurrentTenantAsync_Should_ReturnFalse_When_Inactive()
    {
        // Arrange
        var created = await _sut.CreateAsync("Main Branch", "MAIN", CancellationToken.None);
        await _sut.UpdateAsync(created.Id, created.Name, created.Code, false, CancellationToken.None);

        // Act
        var result = await _sut.IsActiveBranchOfCurrentTenantAsync(created.Id, CancellationToken.None);

        // Assert
        result.ShouldBeFalse();
    }

    [Fact]
    public async Task IsActiveBranchOfCurrentTenantAsync_Should_ReturnFalse_When_BelongsToDifferentTenant()
    {
        // Arrange
        var otherTenantService = new BranchService(_db, CreateAccessor(TenantB));
        var created = await otherTenantService.CreateAsync("Other Branch", "OTHER", CancellationToken.None);

        // Act
        var result = await _sut.IsActiveBranchOfCurrentTenantAsync(created.Id, CancellationToken.None);

        // Assert
        result.ShouldBeFalse();
    }

    #endregion
}

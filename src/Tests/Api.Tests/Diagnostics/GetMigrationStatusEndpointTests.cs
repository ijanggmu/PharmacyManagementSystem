using FSH.Starter.Api.Diagnostics;
using Microsoft.AspNetCore.Http.HttpResults;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Api.Tests.Diagnostics;

/// <summary>
/// Lighter smoke coverage for <see cref="GetMigrationStatusEndpoint"/> — it is mostly framework calls
/// (EF Core's own <c>GetAppliedMigrationsAsync</c>/<c>GetPendingMigrationsAsync</c>), so these tests
/// only verify the handler resolves every configured module context and degrades gracefully (one
/// error entry, not an exception) when a context can't be resolved — it never leaves one module's
/// failure blocking the others' status.
/// </summary>
public sealed class GetMigrationStatusEndpointTests
{
    [Fact]
    public void ModuleDbContexts_Should_Have_No_Duplicate_Module_Names_Or_Context_Types()
    {
        var entries = GetMigrationStatusEndpoint.ModuleDbContexts;

        entries.ShouldNotBeEmpty();
        entries.Select(e => e.Module).Distinct().Count().ShouldBe(entries.Length);
        entries.Select(e => e.ContextType).Distinct().Count().ShouldBe(entries.Length);
    }

    [Fact]
    public async Task HandleAsync_Should_Report_One_Entry_Per_Module_And_Never_Throw()
    {
        // Every DbContext resolution fails (simulates a tenant/connection that can't be resolved) —
        // the handler must still return a status per module rather than propagate the exception.
        var serviceProvider = Substitute.For<IServiceProvider>();
        serviceProvider.GetService(Arg.Any<Type>()).Returns((object?)null);

        var result = await GetMigrationStatusEndpoint.HandleAsync(serviceProvider, CancellationToken.None);

        var ok = result.ShouldBeOfType<Ok<MigrationStatusDto>>();
        ok.Value.ShouldNotBeNull();
        ok.Value!.Contexts.Count.ShouldBe(GetMigrationStatusEndpoint.ModuleDbContexts.Length);
        ok.Value.Contexts.ShouldAllBe(c => c.Error != null && !c.HasPendingMigrations);
    }
}

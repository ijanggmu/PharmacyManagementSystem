using System.Reflection;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.EditOpeningBalances;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.GetOpeningBalances;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.ResetOpeningBalances;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.SearchOpeningBalanceHistory;
using FSH.Modules.Accounting.Features.v1.OpeningBalances.SetOpeningBalances;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;

namespace Accounting.Tests.Features.OpeningBalances;

/// <summary>Reading needs accounting read (Vouchers.View); Set/Edit/Reset need the dedicated Manage permission.</summary>
public sealed class OpeningBalanceEndpointPermissionTests
{
    public static TheoryData<Type, string, string> Endpoints => new()
    {
        { typeof(GetOpeningBalancesEndpoint), "MapGetOpeningBalancesEndpoint", AccountingPermissions.Vouchers.View },
        { typeof(SearchOpeningBalanceHistoryEndpoint), "MapSearchOpeningBalanceHistoryEndpoint", AccountingPermissions.Vouchers.View },
        { typeof(SetOpeningBalancesEndpoint), "MapSetOpeningBalancesEndpoint", AccountingPermissions.OpeningBalances.Manage },
        { typeof(EditOpeningBalancesEndpoint), "MapEditOpeningBalancesEndpoint", AccountingPermissions.OpeningBalances.Manage },
        { typeof(ResetOpeningBalancesEndpoint), "MapResetOpeningBalancesEndpoint", AccountingPermissions.OpeningBalances.Manage },
    };

    [Theory]
    [MemberData(nameof(Endpoints))]
    public async Task Endpoint_Should_RequireThePermission(Type endpointType, string mapMethod, string permission)
    {
        ArgumentNullException.ThrowIfNull(endpointType);
        var builder = WebApplication.CreateSlimBuilder();
        builder.Services.AddSingleton(Substitute.For<IMediator>());
        await using var app = builder.Build();

        endpointType.GetMethod(mapMethod, BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)!
            .Invoke(null, [app]);

        var endpoint = ((IEndpointRouteBuilder)app).DataSources.SelectMany(d => d.Endpoints).ShouldHaveSingleItem();
        var required = endpoint.Metadata.GetOrderedMetadata<IRequiredPermissionMetadata>()
            .SelectMany(m => m.RequiredPermissions)
            .ToList();
        required.ShouldBe([permission]);
    }

    [Fact]
    public void ManagePermission_Should_BeRegistered_UnderTheVouchersResource_And_NotBasic()
    {
        AccountingPermissions.OpeningBalances.Manage.ShouldBe("Permissions.Accounting.Vouchers.ManageOpeningBalances");
        var registered = AccountingPermissions.All.Single(p => p.Action == "ManageOpeningBalances");
        registered.Resource.ShouldBe(AccountingPermissions.Vouchers.Resource);
        registered.IsBasic.ShouldBeFalse();
    }
}

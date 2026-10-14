using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Notifications.Features.v1.Sms;
using FSH.Modules.Reference.Contracts.Authorization;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;

namespace Notifications.Tests.Sms;

/// <summary>
/// The SMS log lists customers' phones and what they owe, so it is gated on the collections permission, not on the
/// basic pharmacy-settings view every till user holds.
/// </summary>
public sealed class SmsEndpointPermissionTests
{
    private static List<string> RequiredPermissions(Func<IEndpointRouteBuilder, RouteHandlerBuilder> map)
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.Services.AddSingleton(Substitute.For<IMediator>());
        using var app = builder.Build();
        map(app);

        var endpoint = ((IEndpointRouteBuilder)app).DataSources.SelectMany(d => d.Endpoints).ShouldHaveSingleItem();
        return endpoint.Metadata.GetOrderedMetadata<IRequiredPermissionMetadata>().SelectMany(m => m.RequiredPermissions).ToList();
    }

    [Fact]
    public void SmsLog_Should_Require_RecordPayment_Not_SettingsView()
    {
        var permissions = RequiredPermissions(e => e.MapSearchSmsMessagesEndpoint());

        permissions.ShouldContain(CustomersPermissions.Ledger.RecordPayment);
        permissions.ShouldNotContain(ReferencePermissions.Settings.View);
    }
}

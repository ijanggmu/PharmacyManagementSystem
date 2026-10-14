using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Billing.Contracts.Authorization;
using FSH.Modules.Billing.Features.v1.Invoices.GetMyInvoices;
using FSH.Modules.Billing.Features.v1.Subscriptions.GetSubscription;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;

namespace Billing.Tests.Services;

/// <summary>The current tenant's plan and invoices are the owner's business: Billing.View, not just signed in.</summary>
public sealed class BillingEndpointPermissionTests
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
    public void MySubscription_Should_Require_BillingView()
    {
        RequiredPermissions(e => e.MapGetMySubscriptionEndpoint()).ShouldContain(BillingPermissions.View);
    }

    [Fact]
    public void MyInvoices_Should_Require_BillingView()
    {
        RequiredPermissions(e => e.MapGetMyInvoicesEndpoint()).ShouldContain(BillingPermissions.View);
    }
}

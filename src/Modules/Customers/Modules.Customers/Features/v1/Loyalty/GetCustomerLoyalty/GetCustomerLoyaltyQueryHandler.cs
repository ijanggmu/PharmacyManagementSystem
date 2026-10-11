using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.Loyalty;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using FSH.Modules.Customers.Data;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Loyalty.GetCustomerLoyalty;

public sealed class GetCustomerLoyaltyQueryHandler(CustomersDbContext dbContext, IMediator mediator)
    : IQueryHandler<GetCustomerLoyaltyQuery, CustomerLoyaltyDto>
{
    public async ValueTask<CustomerLoyaltyDto> Handle(GetCustomerLoyaltyQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var customer = await dbContext.Customers.AsNoTracking()
            .Where(c => c.Id == query.CustomerId)
            .Select(c => new { c.Id, c.IsMember, c.MemberSinceUtc, c.LoyaltyPoints })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {query.CustomerId} not found.");

        var entries = await dbContext.CustomerLoyaltyEntries.AsNoTracking()
            .Where(e => e.CustomerId == query.CustomerId)
            .OrderByDescending(e => e.CreatedAtUtc)
            .Take(Math.Clamp(query.Take, 1, 200))
            .Select(e => new LoyaltyEntryDto(e.Id, e.CreatedAtUtc, e.EntryType.ToString(), e.Points, e.BalanceAfter, e.Description, e.SaleId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var settings = LoyaltySettings.From(
            await mediator.Send(new GetTenantSettingsQuery(LoyaltySettings.Category), cancellationToken).ConfigureAwait(false));

        return new CustomerLoyaltyDto(
            customer.Id, customer.IsMember, customer.MemberSinceUtc, customer.LoyaltyPoints,
            settings.ValueOf(customer.LoyaltyPoints), entries);
    }
}

using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Sales.Contracts.v1.PriceLevels;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.PriceLevels;

public sealed class GetPriceLevelsQueryHandler(SalesDbContext dbContext)
    : IQueryHandler<GetPriceLevelsQuery, IReadOnlyList<PriceLevelDto>>
{
    public async ValueTask<IReadOnlyList<PriceLevelDto>> Handle(GetPriceLevelsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var levels = await dbContext.PriceLevels.AsNoTracking()
            .Where(l => query.IncludeInactive || l.IsActive)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var ids = levels.Select(l => l.Id).ToList();
        var itemCounts = await dbContext.PriceLevelItems.AsNoTracking()
            .Where(i => ids.Contains(i.PriceLevelId))
            .GroupBy(i => i.PriceLevelId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken)
            .ConfigureAwait(false);
        var customerCounts = await dbContext.CustomerPriceLevels.AsNoTracking()
            .Where(c => ids.Contains(c.PriceLevelId))
            .GroupBy(c => c.PriceLevelId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken)
            .ConfigureAwait(false);

        return levels
            .OrderByDescending(l => l.IsActive)
            .ThenBy(l => l.Name, StringComparer.OrdinalIgnoreCase)
            .Select(l => new PriceLevelDto(
                l.Id, l.Name, l.DiscountPercent, l.Description, l.IsActive,
                itemCounts.GetValueOrDefault(l.Id), customerCounts.GetValueOrDefault(l.Id)))
            .ToList();
    }
}

public sealed class GetPriceLevelByIdQueryHandler(SalesDbContext dbContext)
    : IQueryHandler<GetPriceLevelByIdQuery, PriceLevelDetailDto>
{
    public async ValueTask<PriceLevelDetailDto> Handle(GetPriceLevelByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var level = await dbContext.PriceLevels.AsNoTracking()
            .FirstOrDefaultAsync(l => l.Id == query.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Price level {query.Id} not found.");

        var items = await dbContext.PriceLevelItems.AsNoTracking()
            .Where(i => i.PriceLevelId == level.Id)
            .Select(i => new PriceLevelItemDto(i.MedicineId, i.UnitPrice))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PriceLevelDetailDto(level.Id, level.Name, level.DiscountPercent, level.Description, level.IsActive, items);
    }
}

public sealed class CreatePriceLevelCommandHandler(SalesDbContext dbContext) : ICommandHandler<CreatePriceLevelCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreatePriceLevelCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        await PriceLevelRules.EnsureNameFreeAsync(dbContext, command.Name, null, cancellationToken).ConfigureAwait(false);
        var level = PriceLevel.Create(command.Name, command.DiscountPercent, command.Description);
        dbContext.PriceLevels.Add(level);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return level.Id;
    }
}

public sealed class UpdatePriceLevelCommandHandler(SalesDbContext dbContext) : ICommandHandler<UpdatePriceLevelCommand, Unit>
{
    public async ValueTask<Unit> Handle(UpdatePriceLevelCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var level = await dbContext.PriceLevels
            .FirstOrDefaultAsync(l => l.Id == command.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Price level {command.Id} not found.");
        await PriceLevelRules.EnsureNameFreeAsync(dbContext, command.Name, command.Id, cancellationToken).ConfigureAwait(false);
        level.Update(command.Name, command.DiscountPercent, command.Description, command.IsActive);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}

public sealed class SetPriceLevelItemCommandHandler(SalesDbContext dbContext, IMediator mediator)
    : ICommandHandler<SetPriceLevelItemCommand, Unit>
{
    public async ValueTask<Unit> Handle(SetPriceLevelItemCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        bool levelExists = await dbContext.PriceLevels
            .AnyAsync(l => l.Id == command.PriceLevelId, cancellationToken)
            .ConfigureAwait(false);
        if (!levelExists)
        {
            throw new NotFoundException($"Price level {command.PriceLevelId} not found.");
        }

        var item = await dbContext.PriceLevelItems
            .FirstOrDefaultAsync(i => i.PriceLevelId == command.PriceLevelId && i.MedicineId == command.MedicineId, cancellationToken)
            .ConfigureAwait(false);

        if (command.UnitPrice is not { } price)
        {
            if (item is not null)
            {
                dbContext.PriceLevelItems.Remove(item);
                await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            }

            return Unit.Value;
        }

        // 404 for a medicine outside this pharmacy's catalog.
        _ = await mediator.Send(new GetMedicineByIdQuery(command.MedicineId), cancellationToken).ConfigureAwait(false);

        if (item is null)
        {
            dbContext.PriceLevelItems.Add(PriceLevelItem.Create(command.PriceLevelId, command.MedicineId, price));
        }
        else
        {
            item.SetPrice(price);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}

public sealed class AssignCustomerPriceLevelCommandHandler(SalesDbContext dbContext, IMediator mediator)
    : ICommandHandler<AssignCustomerPriceLevelCommand, Unit>
{
    public async ValueTask<Unit> Handle(AssignCustomerPriceLevelCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var assignment = await dbContext.CustomerPriceLevels
            .FirstOrDefaultAsync(c => c.CustomerId == command.CustomerId, cancellationToken)
            .ConfigureAwait(false);

        if (command.PriceLevelId is not { } levelId)
        {
            if (assignment is not null)
            {
                dbContext.CustomerPriceLevels.Remove(assignment);
                await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            }

            return Unit.Value;
        }

        // 404 for an unknown customer (Customers.Contracts only).
        _ = await mediator.Send(new GetCustomerCreditStatusQuery(command.CustomerId), cancellationToken).ConfigureAwait(false);

        bool active = await dbContext.PriceLevels
            .AnyAsync(l => l.Id == levelId && l.IsActive, cancellationToken)
            .ConfigureAwait(false);
        if (!active)
        {
            throw new CustomException(
                "That price level doesn't exist or is not active.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (assignment is null)
        {
            dbContext.CustomerPriceLevels.Add(CustomerPriceLevel.Create(command.CustomerId, levelId));
        }
        else
        {
            assignment.Reassign(levelId);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}

public sealed class GetPriceQuoteQueryHandler(SalesDbContext dbContext) : IQueryHandler<GetPriceQuoteQuery, PriceQuoteDto>
{
    public async ValueTask<PriceQuoteDto> Handle(GetPriceQuoteQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var resolution = await PriceLevelResolver.ResolveAsync(
            dbContext, query.CustomerId, query.PriceLevelId, query.MedicineIds ?? [], cancellationToken)
            .ConfigureAwait(false);

        var applied = resolution.Applied;
        return new PriceQuoteDto(
            resolution.Customer?.Id,
            resolution.Customer?.Name,
            applied?.Id,
            applied?.Name,
            applied?.DiscountPercent ?? 0m,
            applied is null
                ? []
                : applied.ExplicitPrices.Select(p => new PriceLevelItemDto(p.Key, p.Value)).ToList());
    }
}

internal static class PriceLevelRules
{
    public static async ValueTask EnsureNameFreeAsync(
        SalesDbContext dbContext, string name, Guid? exceptId, CancellationToken cancellationToken)
    {
        string trimmed = name.Trim();
#pragma warning disable CA1862, CA1304, CA1311 // translated to SQL lower(); names are compared case-insensitively
        bool taken = await dbContext.PriceLevels
            .AnyAsync(l => l.Id != exceptId && l.Name.ToLower() == trimmed.ToLower(), cancellationToken)
            .ConfigureAwait(false);
#pragma warning restore CA1862, CA1304, CA1311
        if (taken)
        {
            throw new CustomException(
                $"A price level named \"{trimmed}\" already exists.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}

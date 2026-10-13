using System.Globalization;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.v1.ParkedSales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.ParkedSales;

/// <summary>
/// How long a parked bill is kept: tenant setting <c>pos.parked_bill_expiry_hours</c> (Settings → System → Point of
/// sale), default 24, clamped to 1 hour – 30 days.
/// </summary>
public static class ParkedSaleSettings
{
    public const string Category = "pos";
    public const string ExpiryHoursKey = "pos.parked_bill_expiry_hours";
    public const int DefaultExpiryHours = 24;
    public const int MaxExpiryHours = 24 * 30;

    public static TimeSpan LifetimeFrom(IReadOnlyDictionary<string, string>? settings)
    {
        string? raw = settings?.FirstOrDefault(kv => string.Equals(kv.Key, ExpiryHoursKey, StringComparison.OrdinalIgnoreCase)).Value;
        int hours = int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) && parsed > 0
            ? Math.Min(parsed, MaxExpiryHours)
            : DefaultExpiryHours;
        return TimeSpan.FromHours(hours);
    }
}

internal static class ParkedSaleMapper
{
    public static ParkedSaleSummaryDto ToSummary(ParkedSale p) => new(
        p.Id, p.Label, p.CustomerId, p.CustomerName, p.LineCount, p.TotalAmount,
        p.ParkedByUserId, p.ParkedByName, p.ParkedAtUtc, p.ExpiresAtUtc);

    public static ParkedSaleDto ToDto(ParkedSale p) => new(
        p.Id, p.BranchId, p.Label, p.CustomerId, p.CustomerName, p.PrescriptionId, p.PriceLevelId, p.BuyerName, p.BuyerPan,
        p.BillDiscountAmount, p.Notes, p.TotalAmount,
        p.Lines
            .Select(l => new ParkedSaleLineDto(
                l.MedicineId, l.MedicineName, l.Quantity, l.SaleUnit, l.PackCount, l.DiscountPercent, l.UnitPrice, l.LineTotal))
            .ToList(),
        p.ParkedByUserId, p.ParkedByName, p.ParkedAtUtc, p.ExpiresAtUtc);

    /// <summary>Drops this branch's lapsed parked bills (they are never recalled, so nothing else cleans them up).</summary>
    public static async ValueTask PurgeExpiredAsync(
        SalesDbContext dbContext, Guid branchId, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var expired = await dbContext.ParkedSales
            .Where(p => p.BranchId == branchId && p.ExpiresAtUtc <= nowUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (expired.Count > 0)
        {
            dbContext.ParkedSales.RemoveRange(expired);
        }
    }
}

public sealed class ParkSaleCommandHandler(
    SalesDbContext dbContext,
    ICurrentBranch currentBranch,
    ICurrentUser currentUser,
    IMediator mediator,
    TimeProvider timeProvider) : ICommandHandler<ParkSaleCommand, ParkedSaleSummaryDto>
{
    public async ValueTask<ParkedSaleSummaryDto> Handle(ParkSaleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // A retried park (same key) answers with the bill already shelved.
        string? clientParkId = string.IsNullOrWhiteSpace(command.ClientParkId) ? null : command.ClientParkId.Trim();
        if (clientParkId is not null)
        {
            var existing = await dbContext.ParkedSales.AsNoTracking()
                .FirstOrDefaultAsync(p => p.ClientParkId == clientParkId, cancellationToken)
                .ConfigureAwait(false);
            if (existing is not null)
            {
                return ParkedSaleMapper.ToSummary(existing);
            }
        }

        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var settings = await mediator.Send(new GetTenantSettingsQuery(ParkedSaleSettings.Category), cancellationToken).ConfigureAwait(false);
        DateTime now = timeProvider.GetUtcNow().UtcDateTime;

        Guid userId = currentUser.GetUserId();
        var parked = ParkedSale.Park(
            branchId,
            command.Label,
            command.Lines
                .Select(l => new ParkedSaleLine(
                    l.MedicineId, l.MedicineName, l.Quantity, l.SaleUnit, l.PackCount, l.DiscountPercent, l.UnitPrice, l.LineTotal))
                .ToList(),
            command.TotalAmount,
            ParkedSaleSettings.LifetimeFrom(settings),
            now,
            new ParkedSaleHeader(
                command.CustomerId,
                command.CustomerName,
                command.PrescriptionId,
                command.PriceLevelId,
                command.BuyerName,
                command.BuyerPan,
                command.BillDiscountAmount,
                command.Notes,
                userId == Guid.Empty ? null : userId,
                currentUser.Name ?? currentUser.GetUserEmail(),
                clientParkId));

        await ParkedSaleMapper.PurgeExpiredAsync(dbContext, branchId, now, cancellationToken).ConfigureAwait(false);
        dbContext.ParkedSales.Add(parked);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return ParkedSaleMapper.ToSummary(parked);
    }
}

public sealed class GetParkedSalesQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch, TimeProvider timeProvider)
    : IQueryHandler<GetParkedSalesQuery, IReadOnlyList<ParkedSaleSummaryDto>>
{
    /// <summary>A branch never holds more than a handful; the list is capped rather than paged.</summary>
    public const int MaxListed = 100;

    public async ValueTask<IReadOnlyList<ParkedSaleSummaryDto>> Handle(GetParkedSalesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        DateTime now = timeProvider.GetUtcNow().UtcDateTime;

        await ParkedSaleMapper.PurgeExpiredAsync(dbContext, branchId, now, cancellationToken).ConfigureAwait(false);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var parked = await dbContext.ParkedSales.AsNoTracking()
            .Where(p => p.BranchId == branchId && p.ExpiresAtUtc > now)
            .OrderByDescending(p => p.ParkedAtUtc)
            .Take(MaxListed)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return parked.Select(ParkedSaleMapper.ToSummary).ToList();
    }
}

public sealed class RecallParkedSaleCommandHandler(SalesDbContext dbContext, ICurrentBranch currentBranch, TimeProvider timeProvider)
    : ICommandHandler<RecallParkedSaleCommand, ParkedSaleDto>
{
    public async ValueTask<ParkedSaleDto> Handle(RecallParkedSaleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var parked = await ParkedSaleLookup.FindAsync(dbContext, currentBranch, command.Id, cancellationToken).ConfigureAwait(false);

        // Recalling takes it off the shelf. A concurrent recall from another terminal deletes the same row; the loser's
        // delete matches nothing and is reported as gone, so only one till rings the bill up.
        dbContext.ParkedSales.Remove(parked);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw ParkedSaleLookup.Gone(command.Id);
        }

        if (parked.IsExpired(timeProvider.GetUtcNow().UtcDateTime))
        {
            throw new NotFoundException("That held bill has expired.");
        }

        return ParkedSaleMapper.ToDto(parked);
    }
}

public sealed class DiscardParkedSaleCommandHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<DiscardParkedSaleCommand, Unit>
{
    public async ValueTask<Unit> Handle(DiscardParkedSaleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var parked = await ParkedSaleLookup.FindAsync(dbContext, currentBranch, command.Id, cancellationToken).ConfigureAwait(false);
        dbContext.ParkedSales.Remove(parked);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Recalled or discarded elsewhere meanwhile: it is gone either way.
        }

        return Unit.Value;
    }
}

internal static class ParkedSaleLookup
{
    public static async ValueTask<ParkedSale> FindAsync(
        SalesDbContext dbContext, ICurrentBranch currentBranch, Guid id, CancellationToken cancellationToken)
    {
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        return await dbContext.ParkedSales
            .FirstOrDefaultAsync(p => p.Id == id && p.BranchId == branchId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw Gone(id);
    }

    public static NotFoundException Gone(Guid id) =>
        new($"Held bill {id} is no longer on hold — it was recalled, discarded or has expired.");
}

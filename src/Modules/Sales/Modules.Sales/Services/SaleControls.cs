using System.Globalization;
using FSH.Framework.Core.Context;
using FSH.Modules.Identity.Contracts.Approvals;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Reference.Contracts.Controls;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Domain;
using Mediator;

namespace FSH.Modules.Sales.Services;

/// <summary>
/// How deep a sale's discounts go: the deepest single line and the whole bill, each as a percent of the gross
/// (quantity × unit price, before discount).
/// </summary>
public sealed record SaleDiscountFigures(decimal MaxLinePercent, decimal BillPercent)
{
    /// <summary>
    /// The figures for <paramref name="sale"/>. <paramref name="loyaltyRedemption"/> (points spent as a discount) is
    /// not the cashier's discount, so it is taken off the bill figure; since the client spreads it over the lines,
    /// the per-line figure isn't judged on a sale that redeems points.
    /// </summary>
    public static SaleDiscountFigures For(Sale sale, decimal loyaltyRedemption = 0m)
    {
        ArgumentNullException.ThrowIfNull(sale);
        decimal gross = sale.Items.Sum(i => i.Quantity * i.UnitPrice);
        if (gross <= 0m)
        {
            return new SaleDiscountFigures(0m, 0m);
        }

        decimal maxLine = loyaltyRedemption > 0m
            ? 0m
            : sale.Items
                .Where(i => i.Quantity * i.UnitPrice > 0m)
                .Select(i => i.DiscountAmount / (i.Quantity * i.UnitPrice) * 100m)
                .DefaultIfEmpty(0m)
                .Max();
        decimal billDiscount = Math.Max(0m, sale.TotalDiscount - loyaltyRedemption);
        return new SaleDiscountFigures(Round(maxLine), Round(billDiscount / gross * 100m));
    }

    private static decimal Round(decimal percent) => decimal.Round(percent, 2, MidpointRounding.AwayFromZero);
}

/// <summary>
/// Sales' internal controls: per-role discount caps, void/credit-override/refund approvals (see
/// <see cref="InternalControlSettings"/> and <see cref="IApprovalService"/>). Each Ensure* method returns when the
/// action is allowed — directly, or because a matching manager approval token was redeemed — and otherwise throws
/// the 403 <c>approval_required</c> the till turns into an approval dialog.
/// </summary>
public interface ISaleControls
{
    /// <summary>Reads the settings and the current user's roles once per request. Call it before opening a
    /// transaction (the reads then don't run inside it); the Ensure* methods load lazily otherwise.</summary>
    ValueTask PreloadAsync(CancellationToken cancellationToken);

    ValueTask EnsureDiscountWithinCapAsync(
        SaleDiscountFigures figures, IReadOnlyCollection<string>? approvalTokens, string? targetRef, CancellationToken cancellationToken);

    ValueTask EnsureCreditOverrideAllowedAsync(
        decimal amountOnAccount, IReadOnlyCollection<string>? approvalTokens, string? targetRef, CancellationToken cancellationToken);

    /// <summary>Selling at a cheaper price level than the customer's own: <paramref name="reduction"/> is how much less
    /// the bill comes to. Needs <c>Sales.OverridePriceLevel</c> or a manager approval bound to the checkout.</summary>
    ValueTask EnsurePriceLevelOverrideAllowedAsync(
        decimal reduction, string levelName, IReadOnlyCollection<string>? approvalTokens, string? targetRef, CancellationToken cancellationToken);

    ValueTask EnsureVoidAllowedAsync(
        Guid saleId, decimal saleTotal, string? invoiceNumber, IReadOnlyCollection<string>? approvalTokens, CancellationToken cancellationToken);

    ValueTask EnsureRefundAllowedAsync(
        Guid saleId, decimal netRefund, IReadOnlyCollection<string>? approvalTokens, CancellationToken cancellationToken);
}

public sealed class SaleControls(
    IMediator mediator,
    IUserRoleService userRoles,
    IGroupRoleService groupRoles,
    IApprovalService approvals,
    ICurrentUser currentUser) : ISaleControls
{
    private InternalControlSettings? _settings;
    private DiscountCap? _discountCap;

    public async ValueTask PreloadAsync(CancellationToken cancellationToken)
    {
        if (_settings is not null)
        {
            return;
        }

        var stored = await mediator.Send(new GetTenantSettingsQuery(InternalControlSettings.Category), cancellationToken).ConfigureAwait(false);
        var settings = InternalControlSettings.From(stored);

        var roles = new List<string>();
        Guid userId = currentUser.GetUserId();
        if (userId != Guid.Empty)
        {
            string id = userId.ToString();
            var direct = await userRoles.GetUserRolesAsync(id, cancellationToken).ConfigureAwait(false) ?? [];
            roles.AddRange(direct.Where(r => r.Enabled && r.RoleName is not null).Select(r => r.RoleName!));
            roles.AddRange(await groupRoles.GetUserGroupRolesAsync(id, cancellationToken).ConfigureAwait(false) ?? []);
        }

        _discountCap = settings.CapFor(roles);
        _settings = settings;
    }

    public async ValueTask EnsureDiscountWithinCapAsync(
        SaleDiscountFigures figures, IReadOnlyCollection<string>? approvalTokens, string? targetRef, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(figures);
        await PreloadAsync(cancellationToken).ConfigureAwait(false);
        var cap = _discountCap ?? DiscountCap.Unlimited;

        bool lineOver = cap.LinePercent is { } line && figures.MaxLinePercent > line + ApprovalRequirement.Tolerance;
        bool billOver = cap.BillPercent is { } bill && figures.BillPercent > bill + ApprovalRequirement.Tolerance;
        if (!lineOver && !billOver)
        {
            return;
        }

        decimal needed = Math.Max(figures.MaxLinePercent, figures.BillPercent);
        string limit = lineOver
            ? string.Create(CultureInfo.InvariantCulture, $"{cap.LinePercent:0.##}% per line")
            : string.Create(CultureInfo.InvariantCulture, $"{cap.BillPercent:0.##}% per bill");
        string description = string.Create(CultureInfo.InvariantCulture, $"a {needed:0.##}% discount is above your {limit} limit.");

        _ = await approvals.AuthorizeAsync(
                new ApprovalRequirement(ApprovalActions.SaleDiscount, needed, targetRef, description), approvalTokens, null, cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask EnsureCreditOverrideAllowedAsync(
        decimal amountOnAccount, IReadOnlyCollection<string>? approvalTokens, string? targetRef, CancellationToken cancellationToken)
    {
        decimal amount = Money.Round(amountOnAccount);
        string description = string.Create(
            CultureInfo.InvariantCulture, $"putting {amount:N2} on this customer's account goes past their credit limit.");
        _ = await approvals.AuthorizeAsync(
                new ApprovalRequirement(ApprovalActions.CreditOverride, amount, targetRef, description),
                approvalTokens,
                SalesPermissions.Sales.OverrideCreditLimit,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask EnsurePriceLevelOverrideAllowedAsync(
        decimal reduction, string levelName, IReadOnlyCollection<string>? approvalTokens, string? targetRef, CancellationToken cancellationToken)
    {
        decimal amount = Money.Round(reduction);
        if (amount <= 0m)
        {
            return;
        }

        string description = string.Create(
            CultureInfo.InvariantCulture, $"pricing this bill at {levelName} takes {amount:N2} off the customer's own prices.");
        _ = await approvals.AuthorizeAsync(
                new ApprovalRequirement(ApprovalActions.SalePriceLevel, amount, targetRef, description),
                approvalTokens,
                SalesPermissions.Sales.OverridePriceLevel,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask EnsureVoidAllowedAsync(
        Guid saleId, decimal saleTotal, string? invoiceNumber, IReadOnlyCollection<string>? approvalTokens, CancellationToken cancellationToken)
    {
        decimal amount = Money.Round(saleTotal);
        string description = string.Create(
            CultureInfo.InvariantCulture, $"cancelling sale {invoiceNumber ?? saleId.ToString()} ({amount:N2}).");
        _ = await approvals.AuthorizeAsync(
                new ApprovalRequirement(ApprovalActions.SaleVoid, amount, saleId.ToString(), description),
                approvalTokens,
                SalesPermissions.Sales.Cancel,
                cancellationToken)
            .ConfigureAwait(false);
    }

    public async ValueTask EnsureRefundAllowedAsync(
        Guid saleId, decimal netRefund, IReadOnlyCollection<string>? approvalTokens, CancellationToken cancellationToken)
    {
        await PreloadAsync(cancellationToken).ConfigureAwait(false);
        decimal threshold = _settings?.RefundApprovalThreshold ?? InternalControlSettings.Default.RefundApprovalThreshold;
        decimal amount = Money.Round(netRefund);
        if (amount <= threshold)
        {
            return;
        }

        string description = string.Create(
            CultureInfo.InvariantCulture, $"a refund of {amount:N2} is above the {threshold:N2} approval limit.");
        _ = await approvals.AuthorizeAsync(
                new ApprovalRequirement(ApprovalActions.SaleRefund, amount, saleId.ToString(), description),
                approvalTokens,
                IdentityPermissions.Approvals.Approve,
                cancellationToken)
            .ConfigureAwait(false);
    }
}

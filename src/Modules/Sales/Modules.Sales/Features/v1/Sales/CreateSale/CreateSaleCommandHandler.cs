using System.Diagnostics;
using System.Globalization;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.Loyalty;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.Services;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Contracts.Safety;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.Extensions.Logging;


namespace FSH.Modules.Sales.Features.v1.Sales.CreateSale;

/// <summary>
/// Orchestrates Prescriptions (pre-commit dispensing-safety guard), Inventory (FEFO deduction) and the
/// sale insert inside ONE READ COMMITTED transaction opened on the Sales context
/// (<see cref="SalesTransaction"/>). Inventory's deduction joins that transaction through the shared
/// scope connection, so the stock movements, the sale row and the outbox event commit or roll back
/// together. A rejected sale is never persisted.
///
/// Pricing: unit prices are resolved server-side before the transaction opens
/// (<see cref="ResolveCatalogUnitPricesAsync"/>); the client's unit price is ignored. The ONE price source
/// (legacy create_sale_with_items): the selling price of the first FEFO-eligible batch AT THE SALE'S
/// BRANCH — not disposed, not recalled, stock on hand, not expired, earliest expiry then earliest received —
/// when that price is above zero; otherwise the medicine's catalog unit price. The POS shows the same
/// figure: the medicine search's <c>FefoPicks</c> are that same FEFO-ordered sellable list and carry each
/// lot's selling price, so the cart prices from <c>FefoPicks[0].SellingPrice</c> (falling back to the
/// catalog price) exactly as this does.
///
/// Customer account: the balance put on account and any loyalty points redeemed are applied to the
/// customer INSIDE this transaction (<see cref="ICustomerSalePostingService"/>), under a lock on the
/// customer row — so the credit limit and the points balance are checked against every earlier sale of the
/// customer, never a stale balance an asynchronous handler hasn't caught up with yet.
///
/// Concurrency: the deduction locks the candidate batches (<c>SELECT ... FOR UPDATE</c>) and re-reads
/// them after the lock. Two concurrent sales of the same last unit therefore serialize, and the second
/// sees InsufficientStock. One retry is made on a serialization failure or deadlock.
///
/// Accounting's voucher posting and Prescriptions' refill bookkeeping are still driven asynchronously by
/// <see cref="SaleCompletedIntegrationEvent"/> via the Outbox (see docs/pharmacy-modules-plan.md §2).
///
/// Cart-level safety (drug interaction + customer allergy, ported from legacy
/// <c>lib/utils/drug-interactions.ts</c> / <c>app/api/sales/route.ts</c>) is checked right after the
/// controlled-substance/prescription gate and, like it, before the transaction opens — see
/// <see cref="EnforceSafetyWarningsAsync"/>.
/// </summary>
public sealed partial class CreateSaleCommandHandler(
    SalesDbContext dbContext,
    IDispensingSafetyPolicy dispensingSafetyPolicy,
    IUserPermissionService userPermissions,
    IStockDeductionService stockDeductionService,
    IOutboxWriter outbox,
    IMediator mediator,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IInvoiceNumberService invoiceNumbers,
    ICustomerSalePostingService customerPosting,
    ILogger<CreateSaleCommandHandler> logger) : ICommandHandler<CreateSaleCommand, Guid>
{
    private const int BatchPageSize = 200;

    public async ValueTask<Guid> Handle(CreateSaleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var dispenseLines = command.Items
            .Select(i => new DispenseCheckLine(i.MedicineId, i.Quantity))
            .ToList();

        // Medicine labels (generic name, falling back to name — same precedence as the legacy
        // `generic_name || name`) are needed for the permission check, pricing and the safety check
        // below, so they are resolved once, before the transaction opens.
        var medicines = await LoadMedicinesAsync(command.Items.Select(i => i.MedicineId), cancellationToken)
            .ConfigureAwait(false);

        // 1a) Controlled-substance dispense permission (403). Checked before the prescription gate so a
        // caller without the permission is rejected regardless of the prescription supplied.
        await EnsureControlledSubstanceDispenseAllowedAsync(medicines, cancellationToken).ConfigureAwait(false);

        // 1b) Controlled-substance / prescription gate — before any stock or accounting mutation
        // (root plan §6.2). Every controlled or prescription-only line must resolve to a non-expired,
        // non-cancelled prescription for this customer with enough remaining quantity, or this throws (409).
        await dispensingSafetyPolicy.EnsureDispensableAsync(
            dispenseLines, command.PrescriptionId, command.CustomerId ?? Guid.Empty, cancellationToken).ConfigureAwait(false);

        // 2) Drug interaction / customer allergy check — a blocking-with-acknowledgment safety gate
        // (legacy SAFETY_WARNING). Runs before any stock or accounting mutation.
        await EnforceSafetyWarningsAsync(command, medicines, cancellationToken).ConfigureAwait(false);

        // A sale is always attributed to exactly one branch (branch-scoping-plan.md §2). Resolved before
        // the transaction opens: the scoped branch is cached, so no read runs on the shared connection
        // while the transaction is active.
        var branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // Authoritative pricing, read before the transaction opens (other modules' queries run on the
        // shared connection). Client-supplied unit prices are never used.
        var unitPrices = await ResolveCatalogUnitPricesAsync(medicines, branchId, cancellationToken).ConfigureAwait(false);

        // Read before the transaction opens (other modules' queries run on the shared connection).
        var settings = await mediator.Send(new GetPharmacySettingsQuery(), cancellationToken).ConfigureAwait(false);

        // Invoice prefix + branch code (Reference / Multitenancy reads) — also before the transaction.
        var invoiceContext = await invoiceNumbers.ResolveContextAsync(branchId, cancellationToken).ConfigureAwait(false);

        // Whether this caller may go past the customer's credit limit (permission read) — before the
        // transaction; the limit itself is enforced inside it, under the customer row lock.
        bool mayExceedCreditLimit = await ResolveCreditOverrideAsync(command, cancellationToken).ConfigureAwait(false);

        // Loyalty redemption (Customers + settings reads) — validated here, value checked in the transaction.
        decimal redemptionValue = await ResolveLoyaltyRedemptionAsync(command, cancellationToken).ConfigureAwait(false);

        var saleId = await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => PersistSaleAsync(command, dispenseLines, branchId, unitPrices, medicines, settings.VatRatePercent, invoiceContext, mayExceedCreditLimit, redemptionValue, ct),
            cancellationToken).ConfigureAwait(false);

        return saleId;
    }

    /// <summary>
    /// A cart containing a controlled medicine requires <see cref="PrescriptionsPermissions.ControlledSubstances.Dispense"/>
    /// on the caller (403 otherwise), via the Identity permission service the rest of the kit uses.
    /// </summary>
    private async ValueTask EnsureControlledSubstanceDispenseAllowedAsync(
        IReadOnlyDictionary<Guid, MedicineDto> medicines, CancellationToken cancellationToken)
    {
        if (!medicines.Values.Any(m => m.IsControlled))
        {
            return;
        }

        var userId = currentUser.GetUserId();
        if (userId == Guid.Empty)
        {
            throw new UnauthorizedException("no current user");
        }

        bool allowed = await userPermissions
            .HasPermissionAsync(userId.ToString(), PrescriptionsPermissions.ControlledSubstances.Dispense, cancellationToken)
            .ConfigureAwait(false);

        if (!allowed)
        {
            throw new ForbiddenException(
                $"Selling a controlled substance requires {PrescriptionsPermissions.ControlledSubstances.Dispense}.");
        }
    }

    private async ValueTask<IReadOnlyDictionary<Guid, MedicineDto>> LoadMedicinesAsync(
        IEnumerable<Guid> medicineIds, CancellationToken cancellationToken)
    {
        var medicines = new Dictionary<Guid, MedicineDto>();
        foreach (var medicineId in medicineIds.Distinct())
        {
            // Throws NotFoundException for a medicine that is not in this pharmacy's catalog.
            medicines[medicineId] = await mediator
                .Send(new GetMedicineByIdQuery(medicineId), cancellationToken)
                .ConfigureAwait(false);
        }

        return medicines;
    }

    /// <summary>
    /// Mirrors <c>app/api/sales/route.ts</c>: when the cart triggers a drug interaction
    /// (<see cref="DrugInteractionReference"/>) or, if a customer is attached, a match against that
    /// customer's recorded allergies (<see cref="GetCustomerAllergiesQuery"/> — Customers.Contracts
    /// only, never the Customers runtime), the sale is rejected with <see cref="SafetyWarningException"/>
    /// (409) unless the caller set <see cref="CreateSaleCommand.AcknowledgeWarnings"/>.
    /// </summary>
    private async ValueTask EnforceSafetyWarningsAsync(
        CreateSaleCommand command, IReadOnlyDictionary<Guid, MedicineDto> medicines, CancellationToken cancellationToken)
    {
        var labels = command.Items
            .Select(i => i.MedicineId)
            .Distinct()
            .Select(id => MedicineLabel(medicines[id]))
            .ToList();

        var interactions = SaleSafetyChecker.FindInteractions(labels);

        AllergyWarning? allergy = null;
        if (command.CustomerId is { } customerId)
        {
            var allergies = await mediator.Send(new GetCustomerAllergiesQuery(customerId), cancellationToken)
                .ConfigureAwait(false);
            allergy = SaleSafetyChecker.FindAllergyMatch(labels, allergies.Allergies);
        }

        if (interactions.Count == 0 && allergy is null)
        {
            return;
        }

        if (!command.AcknowledgeWarnings)
        {
            throw new SafetyWarningException(interactions, allergy);
        }

        LogAcknowledgedSafetyWarnings(logger, interactions.Count, allergy is not null);
    }

    private static string MedicineLabel(MedicineDto medicine) =>
        string.IsNullOrWhiteSpace(medicine.GenericName) ? medicine.Name : medicine.GenericName;

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Sale proceeded with {InteractionCount} acknowledged drug interaction warning(s); allergy match: {HasAllergyMatch}")]
    private static partial void LogAcknowledgedSafetyWarnings(ILogger logger, int interactionCount, bool hasAllergyMatch);

    private async ValueTask<IReadOnlyDictionary<Guid, decimal>> ResolveCatalogUnitPricesAsync(
        IReadOnlyDictionary<Guid, MedicineDto> medicines, Guid branchId, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var prices = new Dictionary<Guid, decimal>();

        foreach (var (medicineId, medicine) in medicines)
        {
            decimal unitPrice = medicine.UnitPrice;

            // Batch-level override: the FEFO-eligible batch (earliest expiry, stock on hand, not expired)
            // is the one the deduction draws from. A batch selling price above zero overrides the
            // medicine's unit price; otherwise the catalog price stands.
            decimal? batchPrice = await FirstFefoBatchSellingPriceAsync(medicineId, branchId, today, cancellationToken)
                .ConfigureAwait(false);
            if (batchPrice is > 0m)
            {
                unitPrice = batchPrice.Value;
            }

            prices[medicineId] = unitPrice;
        }

        return prices;
    }

    private async ValueTask<decimal?> FirstFefoBatchSellingPriceAsync(
        Guid medicineId, Guid branchId, DateOnly today, CancellationToken cancellationToken)
    {
        int page = 1;
        while (true)
        {
            PagedResponse<MedicineBatchDto> batches = await mediator
                .Send(new SearchBatchesQuery(
                    MedicineId: medicineId,
                    BranchId: branchId,
                    IncludeDisposed: false,
                    ExcludeRecalled: true,
                    PageNumber: page,
                    PageSize: BatchPageSize), cancellationToken)
                .ConfigureAwait(false);

            var eligible = batches.Items.FirstOrDefault(b => b.QuantityOnHand > 0m && b.ExpiryDate >= today);
            if (eligible is not null)
            {
                return eligible.SellingPrice;
            }

            if (page >= batches.TotalPages)
            {
                return null;
            }

            page++;
        }
    }

    private async ValueTask<Guid> PersistSaleAsync(
        CreateSaleCommand command,
        List<DispenseCheckLine> dispenseLines,
        Guid branchId,
        IReadOnlyDictionary<Guid, decimal> unitPrices,
        IReadOnlyDictionary<Guid, MedicineDto> medicines,
        decimal vatRatePercent,
        InvoiceNumberContext invoiceContext,
        bool mayExceedCreditLimit,
        decimal redemptionValue,
        CancellationToken cancellationToken)
    {
        var sale = Sale.StartBuilding(branchId, command.CustomerId, command.PrescriptionId, command.Notes, ResolveCashierUserId());

        // 2) FEFO stock deduction — locks and checks all lines before mutating any (Inventory's invariant).
        // Joins the transaction opened by SalesTransaction.ExecuteAsync.
        var deductionResults = await stockDeductionService.DeductForSaleAsync(
            new StockDeductionRequest(
                ReferenceType: "Sale",
                ReferenceId: sale.Id,
                Lines: command.Items.Select(i => new StockDeductionLine(i.MedicineId, i.Quantity)).ToList()),
            cancellationToken).ConfigureAwait(false);

        decimal totalCost = 0m;
        foreach (var input in command.Items)
        {
            var deduction = deductionResults.First(d => d.MedicineId == input.MedicineId);
            decimal totalDeducted = deduction.Batches.Sum(b => b.QuantityDeducted);
            decimal weightedUnitCost = totalDeducted == 0
                ? 0m
                : deduction.Batches.Sum(b => b.QuantityDeducted * b.UnitCostPrice) / totalDeducted;

            sale.AddItem(
                input.MedicineId,
                input.Quantity,
                unitPrices[input.MedicineId],
                input.DiscountAmount,
                input.DiscountPercent,
                weightedUnitCost,
                medicines[input.MedicineId].IsTaxable);
            totalCost += input.Quantity * weightedUnitCost;
        }

        var (tenders, shortfallIsOnAccount) = ResolveTenders(command);
        sale.Finalize(tenders, shortfallIsOnAccount);

        if (command.RedeemLoyaltyPoints > 0)
        {
            // The points' value must actually be given as a discount on this sale.
            if (sale.TotalDiscount + 0.005m < redemptionValue)
            {
                throw new CustomException(
                    string.Create(
                        CultureInfo.InvariantCulture,
                        $"Redeeming {command.RedeemLoyaltyPoints} points takes {redemptionValue:N2} off, but the sale's discounts total only {sale.TotalDiscount:N2}."),
                    (IEnumerable<string>?)null,
                    HttpStatusCode.BadRequest);
            }

            sale.RecordLoyaltyRedemption(command.RedeemLoyaltyPoints);
        }

        // VAT breakdown (exempt medicines carry no VAT) and the sequential IRD invoice number, reserved on
        // this transaction: per branch, restarting each Nepali fiscal year. A rollback releases the number.
        sale.ApplyVat(vatRatePercent);
        int fiscalYear = NepalFiscalYear.StartYearFor(sale.SaleDateUtc);
        int sequence = await invoiceNumbers.ReserveNextAsync(branchId, fiscalYear, cancellationToken).ConfigureAwait(false);
        sale.AssignInvoice(InvoiceNumberService.Format(invoiceContext, fiscalYear, sequence), fiscalYear);

        // Balance on account + points redeemed hit the customer in THIS transaction, under the customer row
        // lock: refuses (409) a sale past the credit limit, or redeeming points the customer no longer holds.
        if (sale.CustomerId is { } customerId && (sale.BalanceDue > 0m || sale.LoyaltyPointsRedeemed > 0))
        {
            await customerPosting.PostSaleAsync(
                new CustomerSalePosting(
                    customerId, sale.Id, sale.BranchId, sale.BalanceDue, sale.LoyaltyPointsRedeemed,
                    mayExceedCreditLimit, sale.InvoiceNumber),
                cancellationToken).ConfigureAwait(false);
        }

        dbContext.Sales.Add(sale);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // Prescription consumption, authoritative and locked, inside this transaction (Prescriptions joins it).
        await dispensingSafetyPolicy.ConsumeForSaleAsync(
            sale.Id, command.PrescriptionId, command.CustomerId ?? Guid.Empty, dispenseLines, cancellationToken).ConfigureAwait(false);

        // 3) Everything downstream of the committed sale — GL posting (Accounting), refill bookkeeping
        // (Prescriptions) — happens asynchronously off this one event. The outbox row joins this same
        // transaction. VAT is priced-in: the customer pays sale.TotalAmount either way. Only taxable lines
        // carry VAT (see Sale.ApplyVat) — previously VAT was carved out of the whole total.
        decimal vatAmount = sale.VatAmount ?? 0m;

        var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new SaleCompletedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: correlationId,
            Source: "Sales",
            SaleId: sale.Id,
            BranchId: sale.BranchId,
            CustomerId: command.CustomerId,
            PrescriptionId: command.PrescriptionId,
            PaymentMethod: sale.PaymentMethod,
            PaymentAmount: sale.PaymentAmount,
            // Rounded to the paisa, exactly what the tender legs (also whole paisa) sum to.
            TotalAmount: Money.Round(sale.TotalAmount),
            BalanceDue: sale.BalanceDue,
            VatAmount: vatAmount,
            TotalCost: totalCost,
            Lines: dispenseLines.Select(l => new SaleCompletedLine(l.MedicineId, l.Quantity)).ToList(),
            Payments: sale.Payments
                .Select(p => new SaleCompletedPayment(p.Method, p.Amount))
                .ToList(),
            InvoiceNumber: sale.InvoiceNumber,
            LoyaltyPointsRedeemed: sale.LoyaltyPointsRedeemed),
            cancellationToken).ConfigureAwait(false);

        return sale.Id;
    }

    /// <summary>
    /// The authenticated cashier recording the sale, or null when there is no authenticated user
    /// (<see cref="ICurrentUser.GetUserId"/> returns <see cref="Guid.Empty"/> in that case).
    /// </summary>
    private Guid? ResolveCashierUserId()
    {
        var userId = currentUser.GetUserId();
        return userId == Guid.Empty ? null : userId;
    }

    /// <summary>
    /// Whether this sale may go past the customer's credit limit: only when the sale asks for the override
    /// AND the caller holds <see cref="SalesPermissions.Sales.OverrideCreditLimit"/> (403 otherwise).
    /// </summary>
    private async ValueTask<bool> ResolveCreditOverrideAsync(CreateSaleCommand command, CancellationToken cancellationToken)
    {
        if (command.CustomerId is null || !command.OverrideCreditLimit)
        {
            return false;
        }

        var userId = currentUser.GetUserId();
        bool mayExceed = userId != Guid.Empty && await userPermissions
            .HasPermissionAsync(userId.ToString(), SalesPermissions.Sales.OverrideCreditLimit, cancellationToken)
            .ConfigureAwait(false);
        if (!mayExceed)
        {
            throw new ForbiddenException(
                $"Going over a customer's credit limit requires {SalesPermissions.Sales.OverrideCreditLimit}.");
        }

        return true;
    }

    /// <summary>
    /// Checks a loyalty redemption before the transaction and returns its money value (0 when none):
    /// the programme must be on, the customer a member holding the points, at least the minimum redeemed.
    /// </summary>
    private async ValueTask<decimal> ResolveLoyaltyRedemptionAsync(CreateSaleCommand command, CancellationToken cancellationToken)
    {
        if (command.RedeemLoyaltyPoints <= 0 || command.CustomerId is not { } customerId)
        {
            return 0m;
        }

        var loyalty = LoyaltySettings.From(
            await mediator.Send(new GetTenantSettingsQuery(LoyaltySettings.Category), cancellationToken).ConfigureAwait(false));
        var status = await mediator.Send(new GetCustomerLoyaltyStatusQuery(customerId), cancellationToken).ConfigureAwait(false);

        string? problem = RedemptionProblem(loyalty, status, command.RedeemLoyaltyPoints);
        if (problem is not null)
        {
            throw new CustomException(problem, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        return loyalty.ValueOf(command.RedeemLoyaltyPoints);
    }

    private static string? RedemptionProblem(LoyaltySettings loyalty, CustomerLoyaltyStatusDto? status, int points)
    {
        if (!loyalty.Enabled)
        {
            return "The loyalty programme is turned off.";
        }

        if (status is null)
        {
            return "Customer not found.";
        }

        if (!status.IsMember)
        {
            return "Only loyalty members can redeem points.";
        }

        if (points > status.Points)
        {
            return string.Create(CultureInfo.InvariantCulture, $"The customer has {status.Points} points; {points} can't be redeemed.");
        }

        return points < loyalty.MinRedeemPoints
            ? string.Create(CultureInfo.InvariantCulture, $"At least {loyalty.MinRedeemPoints} points must be redeemed at a time.")
            : null;
    }

    /// <summary>
    /// Split tender when <see cref="CreateSaleCommand.Payments"/> is supplied. Otherwise the legacy
    /// single-payment shape, where any shortfall is the balance on account.
    /// </summary>
    private static (IReadOnlyList<SaleTender> Tenders, bool ShortfallIsOnAccount) ResolveTenders(CreateSaleCommand command)
    {
        if (command.Payments is { Count: > 0 } payments)
        {
            var tenders = payments
                .Select(p => new SaleTender(SalePaymentMethods.Normalize(p.Method) ?? p.Method.Trim(), p.Amount, p.Reference))
                .ToList();
            return (tenders, false);
        }

        IReadOnlyList<SaleTender> single = [new SaleTender(command.PaymentMethod!, command.PaymentAmount, null)];
        return (single, true);
    }
}

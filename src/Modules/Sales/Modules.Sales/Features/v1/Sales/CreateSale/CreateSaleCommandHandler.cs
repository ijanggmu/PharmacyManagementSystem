using System.Diagnostics;
using System.Globalization;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.Loyalty;
using FSH.Modules.Customers.Contracts.Services;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Contracts.v1.Loyalty;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.Services;
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
using FSH.Modules.Sales.Data.Configurations;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;


namespace FSH.Modules.Sales.Features.v1.Sales.CreateSale;

/// <summary>
/// Orchestrates Prescriptions (pre-commit dispensing-safety guard), Inventory (FEFO deduction) and the
/// sale insert inside ONE READ COMMITTED transaction opened on the Sales context
/// (<see cref="SalesTransaction"/>). Inventory's deduction joins that transaction through the shared
/// scope connection, so the stock movements, the sale row and the outbox event commit or roll back
/// together. A rejected sale is never persisted.
///
/// Pricing: the batch is the only selling price. Each batch the FEFO deduction draws from (read under the
/// batch lock, inside the transaction) becomes its own sale line at that batch's selling price, so a medicine
/// spread over two lots with different prices is charged each lot's price for the units taken from it. The
/// client's unit price is ignored, and a batch with no selling price (0) blocks the sale (409) rather than
/// falling back to another price. The POS shows the same figures: the medicine search's <c>FefoPicks</c> are
/// that same FEFO-ordered sellable list with each lot's selling price, and the cart prices across them.
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
    public async ValueTask<Guid> Handle(CreateSaleCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Idempotent replay: a sale already recorded for this checkout key is returned as-is (a timed-out
        // request retried, or an offline sale synced twice) — nothing is priced, deducted or posted again.
        if (await FindByClientRequestIdAsync(command.ClientRequestId, cancellationToken).ConfigureAwait(false) is { } existingId)
        {
            return existingId;
        }

        // A sale can only be recorded against a live, active customer: GetCustomerCreditStatusQuery throws
        // 404 for an unknown/trashed customer and 409 for an inactive one. Checked up front, before any
        // pricing or stock work; Customers re-checks IsActive under the customer row lock when it posts.
        if (command.CustomerId is { } saleCustomerId)
        {
            _ = await mediator.Send(new GetCustomerCreditStatusQuery(saleCustomerId), cancellationToken).ConfigureAwait(false);
        }

        var dispenseLines = command.Items
            .Select(i => new DispenseCheckLine(i.MedicineId, i.Quantity))
            .ToList();

        // Medicine labels (generic name, falling back to name — same precedence as the legacy
        // `generic_name || name`) are needed for the permission check, pricing and the safety check
        // below, so they are resolved once, before the transaction opens.
        var medicines = await LoadMedicinesAsync(command.Items.Select(i => i.MedicineId), cancellationToken)
            .ConfigureAwait(false);

        // Pack lines: Quantity (base units) must be exactly PackCount whole packs of the medicine's pack size.
        // Checked before anything is locked or deducted; the pack is kept on the sale line for the invoice.
        var packUnits = ResolvePackUnits(command.Items, medicines);

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

        // Read before the transaction opens (other modules' queries run on the shared connection).
        var settings = await mediator.Send(new GetPharmacySettingsQuery(), cancellationToken).ConfigureAwait(false);

        // Invoice prefix + branch code (Reference / Multitenancy reads) — also before the transaction.
        var invoiceContext = await invoiceNumbers.ResolveContextAsync(branchId, cancellationToken).ConfigureAwait(false);

        // Whether this caller may go past the customer's credit limit (permission read) — before the
        // transaction; the limit itself is enforced inside it, under the customer row lock.
        bool mayExceedCreditLimit = await ResolveCreditOverrideAsync(command, cancellationToken).ConfigureAwait(false);

        // Loyalty redemption (Customers + settings reads) — validated here, value checked in the transaction.
        decimal redemptionValue = await ResolveLoyaltyRedemptionAsync(command, cancellationToken).ConfigureAwait(false);

        try
        {
            return await SalesTransaction.ExecuteAsync(
                dbContext,
                ct => PersistSaleAsync(command, dispenseLines, branchId, medicines, packUnits, settings.VatRatePercent, invoiceContext, mayExceedCreditLimit, redemptionValue, ct),
                cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex) when (command.ClientRequestId is not null && IsClientRequestIdConflict(ex))
        {
            // Lost the race to a concurrent request carrying the same key: that one committed first (this
            // transaction, stock deduction included, has rolled back). Answer with the winner's sale.
            dbContext.ChangeTracker.Clear();
            LogDuplicateCheckoutReplay(logger);
            return await FindByClientRequestIdAsync(command.ClientRequestId, cancellationToken).ConfigureAwait(false)
                ?? throw new CustomException(
                    "A sale for this checkout is already being recorded. Refresh the sales list before trying again.",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
        catch (CustomException) when (command.ClientRequestId is not null)
        {
            // A replay that ran while the original was still in flight can fail on the stock the original just
            // took (InsufficientStock) or another business rule. If the original has committed meanwhile, the
            // checkout DID succeed: answer with its sale rather than a misleading refusal.
            dbContext.ChangeTracker.Clear();
            if (await FindByClientRequestIdAsync(command.ClientRequestId, cancellationToken).ConfigureAwait(false) is { } recorded)
            {
                LogDuplicateCheckoutReplay(logger);
                return recorded;
            }

            throw;
        }
    }

    private async ValueTask<Guid?> FindByClientRequestIdAsync(string? clientRequestId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(clientRequestId))
        {
            return null;
        }

        string key = clientRequestId.Trim();
        Guid id = await dbContext.Sales.AsNoTracking()
            .Where(s => s.ClientRequestId == key)
            .Select(s => s.Id)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        return id == Guid.Empty ? null : id;
    }

    internal static bool IsClientRequestIdConflict(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg
                && string.Equals(pg.ConstraintName, SaleConfiguration.ClientRequestIdIndexName, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Checkout replay lost the race to a concurrent request with the same idempotency key; returning the recorded sale")]
    private static partial void LogDuplicateCheckoutReplay(ILogger logger);

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
        var cartMedicines = command.Items
            .Select(i => i.MedicineId)
            .Distinct()
            .Select(id => medicines[id])
            .ToList();
        var labels = cartMedicines.Select(MedicineLabel).ToList();

        var interactions = SaleSafetyChecker.FindInteractions(labels);

        AllergyWarning? allergy = null;
        if (command.CustomerId is { } customerId)
        {
            var allergies = await mediator.Send(new GetCustomerAllergiesQuery(customerId), cancellationToken)
                .ConfigureAwait(false);
            // Match the allergy against the brand name AND the generic name (and their drug-class /
            // synonym expansions), not just the display label: an allergy recorded as a brand must still
            // catch a cart line whose label is the generic.
            var allergyCheck = cartMedicines
                .Select(m => new AllergyCheckMedicine(MedicineLabel(m), m.Name, m.GenericName))
                .ToList();
            allergy = SaleSafetyChecker.FindAllergyMatch(allergyCheck, allergies.Allergies);
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

    /// <summary>
    /// One sale line per batch the cart line drew from, each at that batch's selling price and cost. The cart
    /// line's percent discount applies to every batch line; its absolute discount is shared out in proportion
    /// to each batch line's gross, with the last line taking the rounding remainder.
    /// </summary>
    private static void AddBatchPricedLines(
        Sale sale, SaleItemInput input, IReadOnlyList<BatchDeductionDetail> batches, MedicineDto medicine,
        SaleItemPackUnit? packUnit = null)
    {
        var unpriced = batches.FirstOrDefault(b => b.SellingPrice <= 0m);
        if (unpriced is not null)
        {
            throw new CustomException(
                $"Batch {unpriced.BatchNo} of {medicine.Name} has no selling price. Set the batch's price in Inventory before selling it.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        decimal totalGross = batches.Sum(b => b.QuantityDeducted * b.SellingPrice);
        decimal discountLeft = input.DiscountAmount;

        for (int i = 0; i < batches.Count; i++)
        {
            var batch = batches[i];
            decimal gross = batch.QuantityDeducted * batch.SellingPrice;
            decimal discount = i == batches.Count - 1 || totalGross == 0m
                ? discountLeft
                : Money.Round(input.DiscountAmount * gross / totalGross);
            discount = Math.Min(discount, discountLeft);
            discountLeft -= discount;

            sale.AddItem(
                input.MedicineId,
                batch.QuantityDeducted,
                batch.SellingPrice,
                discount,
                input.DiscountPercent,
                // Rounded to the paisa: the column stores 2 dp, and returns/cancellations reverse COGS from the
                // stored figure, so the cost posted here must be that same rounded value.
                Money.Round(batch.UnitCostPrice),
                medicine.IsTaxable,
                batch.BatchId,
                batch.BatchNo,
                packUnit);
        }
    }

    /// <summary>
    /// The pack each cart line was sold in (null for a base-unit line), position-matched to the items. A pack
    /// line must be for a medicine with a pack size and its base Quantity exactly PackCount whole packs (400).
    /// Pricing needs nothing extra: a pack is priced as its base units at each lot's selling price.
    /// </summary>
    internal static IReadOnlyList<SaleItemPackUnit?> ResolvePackUnits(
        IReadOnlyList<SaleItemInput> items, IReadOnlyDictionary<Guid, MedicineDto> medicines)
    {
        var units = new List<SaleItemPackUnit?>(items.Count);
        foreach (var input in items)
        {
            if (!input.IsSoldInPacks())
            {
                units.Add(null);
                continue;
            }

            var medicine = medicines[input.MedicineId];
            var packUnit = SaleItemPackUnit.ForMedicine(medicine.UnitsPerPack, medicine.UnitLabel, medicine.Form)
                ?? throw new CustomException(
                    $"{medicine.Name} has no pack size, so it can only be sold in single units.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            packUnit.EnsureConsistent(input.Quantity, input.PackCount ?? 0, medicine.Name);
            units.Add(packUnit);
        }

        return units;
    }

    private async ValueTask<Guid> PersistSaleAsync(
        CreateSaleCommand command,
        List<DispenseCheckLine> dispenseLines,
        Guid branchId,
        IReadOnlyDictionary<Guid, MedicineDto> medicines,
        IReadOnlyList<SaleItemPackUnit?> packUnits,
        decimal vatRatePercent,
        InvoiceNumberContext invoiceContext,
        bool mayExceedCreditLimit,
        decimal redemptionValue,
        CancellationToken cancellationToken)
    {
        var sale = Sale.StartBuilding(
            branchId, command.CustomerId, command.PrescriptionId, command.Notes, ResolveCashierUserId(), command.ClientRequestId);

        // 2) FEFO stock deduction — locks and checks all lines before mutating any (Inventory's invariant).
        // Joins the transaction opened by SalesTransaction.ExecuteAsync.
        var deductionResults = await stockDeductionService.DeductForSaleAsync(
            new StockDeductionRequest(
                ReferenceType: "Sale",
                ReferenceId: sale.Id,
                Lines: command.Items.Select(i => new StockDeductionLine(i.MedicineId, i.Quantity)).ToList()),
            cancellationToken).ConfigureAwait(false);

        // The deduction returns one result per request line, in request order — matched by position, so two
        // cart lines of the same medicine each get their own batches.
        decimal totalCost = 0m;
        for (int i = 0; i < command.Items.Count; i++)
        {
            var input = command.Items[i];
            var deduction = deductionResults[i];
            AddBatchPricedLines(sale, input, deduction.Batches, medicines[input.MedicineId], packUnits[i]);
            totalCost += deduction.Batches.Sum(b => b.QuantityDeducted * Money.Round(b.UnitCostPrice));
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

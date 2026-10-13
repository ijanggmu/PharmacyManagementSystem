using System.Net;
using System.Text.Json;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>One line of a parked cart (base-unit quantity; pack lines also carry the pack count). The prices are the
/// till's figures at park time, kept so a recall can show what changed — never used to price the sale.</summary>
public sealed record ParkedSaleLine(
    Guid MedicineId,
    string MedicineName,
    decimal Quantity,
    string? SaleUnit,
    int? PackCount,
    decimal DiscountPercent,
    decimal UnitPrice,
    decimal LineTotal);

/// <summary>
/// A held ("parked") POS bill: the cart, customer, price level, buyer details and bill discount, kept server-side per
/// branch so any terminal at the branch can recall it. It is a note, not a sale — no stock is reserved or deducted
/// and nothing is posted. It lapses at <see cref="ExpiresAtUtc"/> (the tenant's <c>pos.parked_bill_expiry_hours</c>).
/// </summary>
public sealed class ParkedSale : BaseEntity<Guid>
{
    public const int MaxLabelLength = 100;
    public const int MaxNameLength = 200;
    public const int MaxNotesLength = 1024;
    public const int MaxClientParkIdLength = 100;
    public const int MaxLines = 200;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public Guid BranchId { get; private set; }
    public string Label { get; private set; } = default!;
    public Guid? CustomerId { get; private set; }
    public string? CustomerName { get; private set; }
    public Guid? PrescriptionId { get; private set; }
    public Guid? PriceLevelId { get; private set; }
    public string? BuyerName { get; private set; }
    public string? BuyerPan { get; private set; }
    public decimal BillDiscountAmount { get; private set; }
    public string? Notes { get; private set; }

    /// <summary>The bill total the till showed when it was parked (display only).</summary>
    public decimal TotalAmount { get; private set; }

    public int LineCount { get; private set; }

    /// <summary>The lines as JSON (<see cref="ParkedSaleLine"/>[]): a parked cart is only ever read back whole.</summary>
    public string LinesJson { get; private set; } = "[]";

    public Guid? ParkedByUserId { get; private set; }
    public string? ParkedByName { get; private set; }
    public DateTime ParkedAtUtc { get; private set; }
    public DateTime ExpiresAtUtc { get; private set; }

    /// <summary>The till's key for this park, unique per tenant, so a retried park doesn't shelve the cart twice.</summary>
    public string? ClientParkId { get; private set; }

    private ParkedSale() { }

    public IReadOnlyList<ParkedSaleLine> Lines =>
        JsonSerializer.Deserialize<List<ParkedSaleLine>>(LinesJson, JsonOptions) ?? [];

    public bool IsExpired(DateTime nowUtc) => ExpiresAtUtc <= nowUtc;

    public static ParkedSale Park(
        Guid branchId,
        string? label,
        IReadOnlyList<ParkedSaleLine> lines,
        decimal totalAmount,
        TimeSpan lifetime,
        DateTime nowUtc,
        ParkedSaleHeader header)
    {
        ArgumentNullException.ThrowIfNull(lines);
        ArgumentNullException.ThrowIfNull(header);
        if (lines.Count == 0)
        {
            throw new CustomException("There is nothing in the cart to hold.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        if (lifetime <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(lifetime), lifetime, "A parked bill must live for some time.");
        }

        return new ParkedSale
        {
            Id = Guid.CreateVersion7(),
            BranchId = branchId,
            Label = Clip(string.IsNullOrWhiteSpace(label) ? DefaultLabel(header) : label, MaxLabelLength)!,
            CustomerId = header.CustomerId,
            CustomerName = Clip(header.CustomerName, MaxNameLength),
            PrescriptionId = header.PrescriptionId,
            PriceLevelId = header.PriceLevelId,
            BuyerName = Clip(header.BuyerName, MaxNameLength),
            BuyerPan = Clip(header.BuyerPan, 20),
            BillDiscountAmount = Money.Round(Math.Max(0m, header.BillDiscountAmount)),
            Notes = Clip(header.Notes, MaxNotesLength),
            TotalAmount = Money.Round(totalAmount),
            LineCount = lines.Count,
            LinesJson = JsonSerializer.Serialize(lines, JsonOptions),
            ParkedByUserId = header.ParkedByUserId,
            ParkedByName = Clip(header.ParkedByName, MaxNameLength),
            ParkedAtUtc = nowUtc,
            ExpiresAtUtc = nowUtc.Add(lifetime),
            ClientParkId = Clip(header.ClientParkId, MaxClientParkIdLength),
        };
    }

    private static string DefaultLabel(ParkedSaleHeader header) =>
        string.IsNullOrWhiteSpace(header.CustomerName) ? "Held bill" : header.CustomerName.Trim();

    private static string? Clip(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        string trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}

/// <summary>Everything about a parked bill besides its lines.</summary>
public sealed record ParkedSaleHeader(
    Guid? CustomerId = null,
    string? CustomerName = null,
    Guid? PrescriptionId = null,
    Guid? PriceLevelId = null,
    string? BuyerName = null,
    string? BuyerPan = null,
    decimal BillDiscountAmount = 0m,
    string? Notes = null,
    Guid? ParkedByUserId = null,
    string? ParkedByName = null,
    string? ClientParkId = null);

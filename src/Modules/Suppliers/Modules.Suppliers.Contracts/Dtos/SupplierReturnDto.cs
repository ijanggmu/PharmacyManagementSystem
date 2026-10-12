namespace FSH.Modules.Suppliers.Contracts.Dtos;

public sealed record SupplierReturnItemDto(
    Guid Id,
    Guid MedicineId,
    decimal Quantity,
    decimal UnitCost,
    decimal TotalCost,
    string ReturnReason,
    string? Notes,
    string? MedicineName = null,
    Guid? BatchId = null,
    string? BatchNo = null,
    decimal VatAmount = 0m);

public sealed record SupplierReturnDto(
    Guid Id,
    Guid SupplierId,
    DateTime ReturnDateUtc,
    string? Notes,
    decimal TotalCost,
    DateTime CreatedAtUtc,
    IReadOnlyList<SupplierReturnItemDto> Items,
    Guid? BranchId = null,
    // Debit-note number (DN-…); null on returns recorded before numbering.
    string? DocumentNumber = null,
    string? SupplierInvoiceNumber = null,
    decimal VatAmount = 0m,
    // Cost + VAT: what the payable dropped by.
    decimal TotalAmount = 0m,
    string? SupplierName = null);

/// <summary>A debit note as it appears in the IRD purchase register (negative purchase).
/// <see cref="TaxableAmount"/> is the cost of the lines that reversed input VAT; <see cref="ExemptAmount"/>
/// the cost of the lines that carried none (VAT-exempt medicines).</summary>
public sealed record SupplierDebitNoteRegisterDto(
    Guid Id,
    DateTime ReturnDateUtc,
    Guid SupplierId,
    string? DocumentNumber,
    string? SupplierInvoiceNumber,
    decimal TaxableAmount,
    decimal VatAmount,
    Guid? BranchId,
    decimal ExemptAmount = 0m);

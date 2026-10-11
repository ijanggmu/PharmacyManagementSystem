using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// Exact-duplicate check for the create form: medicines whose name, strength and form match
/// (case- and whitespace-insensitive). Unlike <see cref="FindSimilarMedicineNamesQuery"/> (LASA,
/// which excludes exact matches), this finds the same product entered twice.
/// </summary>
public sealed record FindDuplicateMedicinesQuery(
    string Name,
    string? Strength = null,
    string? Form = null,
    Guid? ExcludeId = null) : IQuery<List<DuplicateMedicineDto>>;

/// <summary>Generates an in-store EAN-13 (prefix 2) not yet used by any of the tenant's medicines.</summary>
public sealed record GenerateMedicineBarcodeQuery : IQuery<GeneratedBarcodeDto>;

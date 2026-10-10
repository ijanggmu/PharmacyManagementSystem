using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

public sealed record ListTrashedMedicinesQuery(int PageNumber = 1, int PageSize = 20)
    : IQuery<PagedResponse<MedicineDto>>;

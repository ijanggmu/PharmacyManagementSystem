using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Batches;

public sealed record GetBatchByIdQuery(Guid BatchId) : IQuery<MedicineBatchDto>;

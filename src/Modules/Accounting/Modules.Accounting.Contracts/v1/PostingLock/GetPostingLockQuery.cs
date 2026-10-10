using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.PostingLock;

public sealed record GetPostingLockQuery : IQuery<PostingLockDto>;

using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Chat.Contracts.v1.Commands;
using FSH.Modules.Chat.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Chat.Features.v1.Channels.RestoreChannel;

public sealed class RestoreChannelCommandHandler(ChatDbContext db)
    : ICommandHandler<RestoreChannelCommand, Unit>
{
    public async ValueTask<Unit> Handle(RestoreChannelCommand cmd, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(cmd);

        // Drop ONLY the SoftDelete filter so an archived channel is found; the tenant filter stays on so a
        // channel id from another tenant resolves to 404.
        var channel = await db.Channels.IgnoreQueryFilters([QueryFilters.SoftDelete])
            .FirstOrDefaultAsync(c => c.Id == cmd.ChannelId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("Channel not found.");

        if (!channel.IsDeleted) return Unit.Value; // idempotent
        channel.Restore();
        await db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}

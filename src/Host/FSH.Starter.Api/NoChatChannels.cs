using FSH.Framework.Web.Realtime;

namespace FSH.Starter.Api;

/// <summary>
/// The shared SignalR <see cref="AppHub"/> (BuildingBlocks) takes channel-membership services that only the
/// removed Chat module implemented (docs/adr/0004). The hub still carries notifications and presence, so
/// the host supplies a "no channels" implementation: nobody is a member of any channel, and no connection
/// pre-joins channel groups. The hub's chat-only methods (typing indicators) then refuse every call.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage("Microsoft.Performance", "CA1812:AvoidUninstantiatedInternalClasses", Justification = "Instantiated by DI")]
internal sealed class NoChatChannels : IChannelMembershipChecker, IUserChannelLookup
{
    public ValueTask<bool> IsMemberAsync(Guid channelId, string userId, CancellationToken cancellationToken = default) =>
        ValueTask.FromResult(false);

    public ValueTask<IReadOnlyList<Guid>> ListMyChannelIdsAsync(string userId, CancellationToken cancellationToken = default) =>
        ValueTask.FromResult<IReadOnlyList<Guid>>([]);
}

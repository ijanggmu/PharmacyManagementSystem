namespace Appointments.Tests.Features;

/// <summary>A clock the test moves by hand.</summary>
internal sealed class SettableClock(DateTimeOffset now) : TimeProvider
{
    private DateTimeOffset _now = now;

    public void SetUtcNow(DateTimeOffset now) => _now = now;

    public override DateTimeOffset GetUtcNow() => _now;
}

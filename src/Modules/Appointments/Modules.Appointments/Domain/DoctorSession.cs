using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Appointments.Domain;

/// <summary>
/// One dated sitting of a doctor, saved the first time a token is booked in it. It copies the sitting's times and
/// size from the weekly days / extra day at that moment (so later changes to the weekly days don't move booked
/// patients), and holds the token counter: <see cref="IssuedTokens"/> only ever goes up, so a token number is never
/// handed out twice, while <see cref="BookedCount"/> (tokens not cancelled) is what fills the sitting. Two counters
/// booking at once collide on <see cref="RowVersion"/> and the loser retries.
/// </summary>
public sealed class DoctorSession : AggregateRoot<Guid>
{
    public Guid DoctorId { get; private set; }
    public Guid BranchId { get; private set; }
    public DateOnly Date { get; private set; }
    public TimeOnly StartTime { get; private set; }
    public TimeOnly EndTime { get; private set; }
    public int MaxTokens { get; private set; }
    public bool IsExtraDay { get; private set; }
    public int IssuedTokens { get; private set; }
    public int BookedCount { get; private set; }

    /// <summary>Optimistic-concurrency token, mapped to Postgres' <c>xmin</c>.</summary>
    public uint RowVersion { get; }

    private DoctorSession() { }

    public static DoctorSession Create(
        Guid doctorId, Guid branchId, DateOnly date, TimeOnly start, TimeOnly end, int maxTokens, bool isExtraDay) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            DoctorId = doctorId,
            BranchId = branchId,
            Date = date,
            StartTime = start,
            EndTime = end,
            MaxTokens = maxTokens,
            IsExtraDay = isExtraDay,
        };

    public bool IsFull => BookedCount >= MaxTokens;

    /// <summary>Follows a change to the sitting in the weekly days. Never shrinks below the patients already booked.</summary>
    public void Resize(TimeOnly end, int maxTokens)
    {
        if (end > StartTime)
        {
            EndTime = end;
        }

        MaxTokens = Math.Max(maxTokens, BookedCount);
    }

    /// <summary>Hands out the next token number, or refuses when every place is taken.</summary>
    public int IssueToken()
    {
        if (IsFull)
        {
            throw new CustomException(
                "This sitting is full. Pick another day, or ask the doctor to see more patients.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        IssuedTokens++;
        BookedCount++;
        return IssuedTokens;
    }

    /// <summary>A cancelled token frees its place; its number is not reused.</summary>
    public void ReleasePlace()
    {
        if (BookedCount > 0)
        {
            BookedCount--;
        }
    }
}

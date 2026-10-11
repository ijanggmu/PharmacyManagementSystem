using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Domain;

namespace Sales.Tests.Domain;

public sealed class IrdInvoiceQueueEntryTests
{
    private static IrdInvoiceQueueEntry CreateItem() =>
        IrdInvoiceQueueEntry.Enqueue(Guid.CreateVersion7(), "{\"invoiceNumber\":\"INV-1\"}");

    #region Enqueue

    [Fact]
    public void Enqueue_Should_Start_Pending_With_Zero_Attempts()
    {
        var item = CreateItem();

        item.Status.ShouldBe(IrdQueueStatus.Pending);
        item.Attempts.ShouldBe(0);
        item.LastError.ShouldBeNull();
    }

    [Fact]
    public void Enqueue_Should_Throw_When_PayloadJson_Is_Empty()
    {
        Should.Throw<ArgumentException>(() => IrdInvoiceQueueEntry.Enqueue(Guid.CreateVersion7(), ""));
    }

    #endregion

    #region BeginAttempt

    [Fact]
    public void BeginAttempt_Should_Increment_Attempts_And_Move_To_Processing()
    {
        var item = CreateItem();

        item.BeginAttempt();

        item.Attempts.ShouldBe(1);
        item.Status.ShouldBe(IrdQueueStatus.Processing);
    }

    [Fact]
    public void BeginAttempt_Should_Throw_When_Not_Pending()
    {
        var item = CreateItem();
        item.BeginAttempt();

        Should.Throw<CustomException>(() => item.BeginAttempt());
    }

    #endregion

    #region MarkSent / MarkFailed

    [Fact]
    public void MarkSent_Should_Clear_Error_And_NextAttempt()
    {
        var item = CreateItem();
        item.BeginAttempt();
        item.MarkFailed("boom", isFinal: false, nextAttemptAtUtc: DateTime.UtcNow.AddMinutes(1));

        item.MarkSent();

        item.Status.ShouldBe(IrdQueueStatus.Sent);
        item.LastError.ShouldBeNull();
        item.NextAttemptAtUtc.ShouldBeNull();
    }

    [Fact]
    public void MarkFailed_Should_Return_To_Pending_With_NextAttempt_When_Not_Final()
    {
        var item = CreateItem();
        item.BeginAttempt();
        var nextAttempt = DateTime.UtcNow.AddMinutes(5);

        item.MarkFailed("transient error", isFinal: false, nextAttemptAtUtc: nextAttempt);

        item.Status.ShouldBe(IrdQueueStatus.Pending);
        item.LastError.ShouldBe("transient error");
        item.NextAttemptAtUtc.ShouldBe(nextAttempt);
    }

    [Fact]
    public void MarkFailed_Should_Move_To_Failed_And_Clear_NextAttempt_When_Final()
    {
        var item = CreateItem();
        item.BeginAttempt();

        item.MarkFailed("permanent error", isFinal: true, nextAttemptAtUtc: DateTime.UtcNow.AddMinutes(5));

        item.Status.ShouldBe(IrdQueueStatus.Failed);
        item.LastError.ShouldBe("permanent error");
        item.NextAttemptAtUtc.ShouldBeNull();
    }

    #endregion
}

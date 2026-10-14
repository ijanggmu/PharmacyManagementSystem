using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace FSH.Framework.Persistence;

/// <summary>
/// Tracks the open transaction on each connection in the current DI scope.
///
/// <see cref="DbConnection"/> exposes no way to ask "is a transaction open on you?", so a context
/// that wants to join another context's transaction has no way to find it. This interceptor is
/// attached to every Hero DbContext and records transactions as they start and end, which is what
/// lets the outbox write enlist in the business transaction instead of committing separately.
/// </summary>
public sealed class AmbientDbTransactionRegistry : IDbTransactionInterceptor
{
    private readonly Dictionary<DbConnection, DbTransaction> _open = [];

    /// <summary>
    /// The transaction currently open on <paramref name="connection"/>, or null when there is
    /// none — in which case a write simply commits on its own, as it always has.
    /// </summary>
    public DbTransaction? Find(DbConnection connection)
        => connection is not null && _open.TryGetValue(connection, out var transaction) ? transaction : null;

    // These must match IDbTransactionInterceptor exactly (connection, event data, result): the interface has default
    // implementations, so a method with another signature compiles but is never called — and then no transaction
    // was ever tracked, every Find returned null, and a write that tried to join the business transaction opened a
    // second one on the shared connection instead ("A transaction is already in progress").
    public DbTransaction TransactionStarted(DbConnection connection, TransactionEndEventData eventData, DbTransaction result)
    {
        Track(connection, result);
        return result;
    }

    public ValueTask<DbTransaction> TransactionStartedAsync(
        DbConnection connection, TransactionEndEventData eventData, DbTransaction result, CancellationToken cancellationToken = default)
    {
        Track(connection, result);
        return ValueTask.FromResult(result);
    }

    public DbTransaction TransactionUsed(DbConnection connection, TransactionEventData eventData, DbTransaction result)
    {
        Track(connection, result);
        return result;
    }

    public ValueTask<DbTransaction> TransactionUsedAsync(
        DbConnection connection, TransactionEventData eventData, DbTransaction result, CancellationToken cancellationToken = default)
    {
        Track(connection, result);
        return ValueTask.FromResult(result);
    }

    public void TransactionCommitted(DbTransaction transaction, TransactionEndEventData eventData)
        => Forget(transaction);

    public Task TransactionCommittedAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        Forget(transaction);
        return Task.CompletedTask;
    }

    public void TransactionRolledBack(DbTransaction transaction, TransactionEndEventData eventData)
        => Forget(transaction);

    public Task TransactionRolledBackAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
    {
        Forget(transaction);
        return Task.CompletedTask;
    }

    public void TransactionFailed(DbTransaction transaction, TransactionErrorEventData eventData)
        => Forget(transaction);

    public Task TransactionFailedAsync(DbTransaction transaction, TransactionErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        Forget(transaction);
        return Task.CompletedTask;
    }

    private void Track(DbConnection connection, DbTransaction? transaction)
    {
        if (connection is not null && transaction is not null)
        {
            _open[connection] = transaction;
        }
    }

    // By value: once a transaction has committed or rolled back its Connection property is null on Npgsql.
    private void Forget(DbTransaction? transaction)
    {
        if (transaction is null)
        {
            return;
        }

        foreach (var entry in _open.Where(e => ReferenceEquals(e.Value, transaction)).ToList())
        {
            _open.Remove(entry.Key);
        }
    }
}

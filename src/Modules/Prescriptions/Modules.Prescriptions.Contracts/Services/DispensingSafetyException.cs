using System.Net;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Prescriptions.Contracts.Services;

/// <summary>
/// Thrown by <see cref="IDispensingSafetyPolicy.EnsureDispensableAsync"/> when a controlled
/// medicine can't be dispensed under the given (or missing) prescription. Maps to 409 Conflict.
/// </summary>
public sealed class DispensingSafetyException : CustomException
{
    public DispensingSafetyException(string message)
        : base(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict)
    {
    }

    public DispensingSafetyException() : this("Dispensing safety check failed.") { }

    public DispensingSafetyException(string message, Exception innerException)
        : base(message, innerException, HttpStatusCode.Conflict)
    {
    }
}

using FSH.Framework.Core.Exceptions;
using Microsoft.AspNetCore.Http;

namespace FSH.Modules.Auditing;

/// <summary>
/// Maps an unhandled exception to the HTTP status code the global exception handler will send,
/// so the Activity audit row written for a failed request carries the real outcome (400/401/403/404/500…)
/// instead of the not-yet-set response status. Mirrors <c>GlobalExceptionHandler</c> in BuildingBlocks.
/// </summary>
public static class AuditExceptionStatusMapper
{
    /// <summary>Non-standard "client closed request" status (nginx convention) for cancelled requests.</summary>
    public const int ClientClosedRequest = 499;

    public static int Map(Exception exception)
    {
        ArgumentNullException.ThrowIfNull(exception);

        return exception switch
        {
            OperationCanceledException => ClientClosedRequest,
            FluentValidation.ValidationException => StatusCodes.Status400BadRequest,
            CustomException custom => (int)custom.StatusCode,
            UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
            KeyNotFoundException => StatusCodes.Status404NotFound,
            BadHttpRequestException bad => bad.StatusCode,
            _ => StatusCodes.Status500InternalServerError,
        };
    }
}

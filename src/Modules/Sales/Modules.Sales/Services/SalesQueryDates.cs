using System.Reflection;
using Microsoft.AspNetCore.Http;

namespace FSH.Modules.Sales.Services;

/// <summary>
/// Normalises the <see cref="DateTime"/> query-string values of the Sales GET endpoints (reports, IRD registers, lists) before they reach a
/// handler. Model binding gives <c>?fromUtc=2026-10-01</c> (or a time without a zone) <see cref="DateTimeKind.Unspecified"/>
/// and a value with an offset <see cref="DateTimeKind.Local"/>; Npgsql refuses both for <c>timestamptz</c>, which
/// turned every such report request into a 500.
/// <list type="bullet">
/// <item>A date only (midnight, no zone) is a Nepal business day: a lower bound (<c>fromUtc</c>, <c>monthStartUtc</c>)
/// becomes the start of that Nepal day, an upper bound (<c>toUtc</c>, <c>dateToUtc</c>, <c>asOfUtc</c>) the end of it.</item>
/// <item>A time without a zone is taken as UTC; a value with an offset is converted to UTC.</item>
/// </list>
/// Applies to the endpoint's own <see cref="DateTime"/> parameters and to the properties of an
/// <c>[AsParameters]</c> query object.
/// </summary>
public static class SalesQueryDates
{
    /// <summary>The last representable PostgreSQL instant (microsecond precision) of a Nepal day.</summary>
    private static readonly TimeSpan EndOfDayGap = TimeSpan.FromTicks(TimeSpan.TicksPerMicrosecond);

    /// <summary>Nepal Standard Time, UTC+05:45 (no daylight saving).</summary>
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    public static DateTime Normalize(DateTime value, bool upperBound)
    {
        switch (value.Kind)
        {
            case DateTimeKind.Utc:
                return value;
            case DateTimeKind.Local:
                return value.ToUniversalTime();
            default:
                if (value.TimeOfDay != TimeSpan.Zero)
                {
                    return DateTime.SpecifyKind(value, DateTimeKind.Utc);
                }

                var day = DateOnly.FromDateTime(value);
                DateTime start = DateTime.SpecifyKind(day.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc) - NepalOffset;
                return upperBound ? start.AddDays(1) - EndOfDayGap : start;
        }
    }

    /// <summary>Whether a parameter or property name is the upper end of a range: <c>to…</c>, <c>…ToUtc</c>, <c>…End…</c>
    /// (<c>periodEndUtc</c>), <c>asOf…</c>.</summary>
    public static bool IsUpperBound(string? name) =>
        name is not null
        && (name.StartsWith("to", StringComparison.OrdinalIgnoreCase)
            || name.Contains("ToUtc", StringComparison.OrdinalIgnoreCase)
            || name.Contains("End", StringComparison.Ordinal)
            || name.StartsWith("end", StringComparison.Ordinal)
            || name.StartsWith("asOf", StringComparison.OrdinalIgnoreCase));

    /// <summary>Endpoint filter factory for the Sales route group.</summary>
    public static EndpointFilterDelegate Factory(EndpointFilterFactoryContext factoryContext, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(factoryContext);
        ArgumentNullException.ThrowIfNull(next);

        var slots = new List<(int Index, string Name, PropertyInfo[]? Properties)>();
        ParameterInfo[] parameters = factoryContext.MethodInfo.GetParameters();
        for (int i = 0; i < parameters.Length; i++)
        {
            var parameter = parameters[i];
            if (IsDateTime(parameter.ParameterType))
            {
                slots.Add((i, parameter.Name ?? string.Empty, null));
            }
            else if (parameter.GetCustomAttribute<AsParametersAttribute>() is not null)
            {
                PropertyInfo[] dates = parameter.ParameterType
                    .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                    .Where(p => IsDateTime(p.PropertyType) && p.CanRead && p.SetMethod is not null)
                    .ToArray();
                if (dates.Length > 0)
                {
                    slots.Add((i, parameter.Name ?? string.Empty, dates));
                }
            }
        }

        if (slots.Count == 0)
        {
            return next;
        }

        return invocationContext =>
        {
            if (HttpMethods.IsGet(invocationContext.HttpContext.Request.Method))
            {
                NormalizeArguments(invocationContext.Arguments, slots);
            }

            return next(invocationContext);
        };
    }

    private static void NormalizeArguments(IList<object?> arguments, List<(int Index, string Name, PropertyInfo[]? Properties)> slots)
    {
        foreach (var (index, name, properties) in slots)
        {
            if (index >= arguments.Count || arguments[index] is not { } argument)
            {
                continue;
            }

            if (properties is null)
            {
                if (argument is DateTime value)
                {
                    arguments[index] = Normalize(value, IsUpperBound(name));
                }

                continue;
            }

            foreach (var property in properties)
            {
                if (property.GetValue(argument) is DateTime value)
                {
                    property.SetValue(argument, Normalize(value, IsUpperBound(property.Name)));
                }
            }

            // A struct query object was boxed: put the updated copy back.
            if (argument.GetType().IsValueType)
            {
                arguments[index] = argument;
            }
        }
    }

    private static bool IsDateTime(Type type) => type == typeof(DateTime) || type == typeof(DateTime?);
}

namespace FSH.Modules.Auditing.Features.v1.Common;

/// <summary>
/// Turns the assembly-qualified CLR type names stored by the outbox/inbox
/// (e.g. <c>FSH.Modules.Sales.Contracts.Events.SaleCompletedIntegrationEvent, FSH.Modules.Sales.Contracts, Version=…</c>)
/// into something a person can scan: <c>SaleCompleted</c>, module <c>Sales</c>.
/// </summary>
public static class ClrTypeNames
{
    private const string IntegrationEventSuffix = "IntegrationEvent";

    /// <summary>Strips the assembly qualification (", Assembly, Version=…") while keeping generic arguments intact.</summary>
    public static string StripAssembly(string? typeName)
    {
        if (string.IsNullOrWhiteSpace(typeName))
        {
            return string.Empty;
        }

        int depth = 0;
        for (int i = 0; i < typeName.Length; i++)
        {
            char c = typeName[i];
            if (c == '[')
            {
                depth++;
            }
            else if (c == ']')
            {
                depth--;
            }
            else if (c == ',' && depth == 0)
            {
                return typeName[..i].Trim();
            }
        }

        return typeName.Trim();
    }

    /// <summary>
    /// Short display name: namespace and assembly removed, generic arity rendered as <c>Name&lt;Arg&gt;</c>,
    /// and (optionally) a trailing "IntegrationEvent" suffix dropped.
    /// </summary>
    public static string ToShortName(string? typeName, bool stripIntegrationEventSuffix = true)
    {
        var full = StripAssembly(typeName);
        if (full.Length == 0)
        {
            return string.Empty;
        }

        string genericPart = string.Empty;
        var head = full;
        var bracket = full.IndexOf('[', StringComparison.Ordinal);
        if (bracket >= 0)
        {
            head = full[..bracket];
            var inner = full[bracket..];
            var args = ParseGenericArguments(inner)
                .Select(a => ToShortName(a, stripIntegrationEventSuffix))
                .Where(a => a.Length > 0)
                .ToList();
            if (args.Count > 0)
            {
                genericPart = "<" + string.Join(", ", args) + ">";
            }
        }

        var tick = head.IndexOf('`', StringComparison.Ordinal);
        if (tick >= 0)
        {
            head = head[..tick];
        }

        var lastDot = head.LastIndexOf('.');
        var name = lastDot >= 0 ? head[(lastDot + 1)..] : head;
        var plus = name.LastIndexOf('+');
        if (plus >= 0)
        {
            name = name[(plus + 1)..];
        }

        if (stripIntegrationEventSuffix
            && name.Length > IntegrationEventSuffix.Length
            && name.EndsWith(IntegrationEventSuffix, StringComparison.Ordinal))
        {
            name = name[..^IntegrationEventSuffix.Length];
        }

        return name + genericPart;
    }

    /// <summary>Owning module from an <c>FSH.Modules.{Module}.…</c> / <c>FSH.Framework.{Area}.…</c> namespace, else null.</summary>
    public static string? ModuleOf(string? typeName)
    {
        var full = StripAssembly(typeName);
        var parts = full.Split('.', 4);
        if (parts.Length >= 3 && parts[0] == "FSH" && (parts[1] == "Modules" || parts[1] == "Framework"))
        {
            var module = parts[2];
            var cut = module.IndexOfAny(['`', '[', '+']);
            return cut >= 0 ? module[..cut] : module;
        }

        return null;
    }

    /// <summary>
    /// Parses the outer generic argument list <c>[[A, Asm],[B, Asm]]</c> into its argument type names.
    /// </summary>
    private static List<string> ParseGenericArguments(string bracketed)
    {
        var result = new List<string>();
        if (bracketed.Length < 2 || bracketed[0] != '[')
        {
            return result;
        }

        // Drop the outermost [ ... ] pair.
        var close = bracketed.LastIndexOf(']');
        var inner = close > 0 ? bracketed[1..close] : bracketed[1..];

        int depth = 0, start = -1;
        for (int i = 0; i < inner.Length; i++)
        {
            char c = inner[i];
            if (c == '[')
            {
                if (depth == 0)
                {
                    start = i + 1;
                }
                depth++;
            }
            else if (c == ']')
            {
                depth--;
                if (depth == 0 && start >= 0)
                {
                    result.Add(inner[start..i]);
                    start = -1;
                }
            }
        }

        // Non-assembly-qualified form: [A,B]
        if (result.Count == 0 && inner.Length > 0)
        {
            result.AddRange(inner.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        }

        return result;
    }
}

using System.Text.Json;

namespace Integration.Tests.Infrastructure;

/// <summary>
/// Reads the tenant provisioning payload's top-level <c>status</c>. A substring match on "Completed" is
/// not enough: the payload always carries a <c>completedUtc</c> property and per-step statuses, so it
/// "matched" while seeding was still running and tests raced the role/permission seed (flaky 403s).
/// </summary>
internal static class ProvisioningStatus
{
    public static bool IsCompleted(string json)
    {
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("status", out var status))
        {
            return false;
        }

        string? value = status.GetString();
        if (string.Equals(value, "Failed", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Tenant provisioning failed: {json}");
        }

        return string.Equals(value, "Completed", StringComparison.OrdinalIgnoreCase);
    }
}

using System.Globalization;
using System.Net;

namespace FSH.Modules.Multitenancy.Features.v1.CreateTenant;

/// <summary>The PharmaCare welcome email sent to a new tenant's admin. Every value is HTML-encoded.</summary>
public static class TenantWelcomeEmail
{
    public sealed record Details(
        string PharmacyName,
        string TenantCode,
        string SignInUrl,
        string AdminEmail,
        string AdminPassword,
        string? Plan,
        DateTime ValidUpto);

    public static (string Subject, string Body) Build(Details details)
    {
        ArgumentNullException.ThrowIfNull(details);

        string subject = $"Welcome to PharmaCare: {details.PharmacyName} is ready";
        string validUntil = details.ValidUpto.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture);

        string Row(string label, string value, bool mono = false) =>
            "<tr>" +
            $"<td style=\"padding:8px 12px;color:#475569;white-space:nowrap;vertical-align:top\">{E(label)}</td>" +
            $"<td style=\"padding:8px 12px;color:#0f172a;font-weight:600;{(mono ? "font-family:Consolas,Menlo,monospace;" : string.Empty)}\">{E(value)}</td>" +
            "</tr>";

        string body =
            "<div style=\"font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a\">" +
            "<div style=\"background:#0f766e;color:#ffffff;padding:20px 24px;border-radius:8px 8px 0 0\">" +
            "<div style=\"font-size:20px;font-weight:700\">PharmaCare</div>" +
            "<div style=\"font-size:14px;opacity:.9\">Pharmacy management, done right</div></div>" +
            "<div style=\"border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 8px 8px\">" +
            "<p style=\"margin:0 0 12px\">Hello,</p>" +
            $"<p style=\"margin:0 0 12px\">Your pharmacy <strong>{E(details.PharmacyName)}</strong> has been set up on PharmaCare. " +
            "You are its first administrator. Use the details below to sign in.</p>" +
            "<table style=\"border-collapse:collapse;width:100%;background:#f8fafc;border-radius:6px;margin:16px 0\">" +
            Row("Pharmacy", details.PharmacyName) +
            Row("Pharmacy code", details.TenantCode, mono: true) +
            Row("Sign-in page", details.SignInUrl) +
            Row("Admin email", details.AdminEmail) +
            Row("Temporary password", details.AdminPassword, mono: true) +
            Row("Plan", string.IsNullOrWhiteSpace(details.Plan) ? "Trial" : details.Plan!) +
            Row("Valid until", validUntil) +
            "</table>" +
            $"<p style=\"margin:0 0 20px\"><a href=\"{E(details.SignInUrl)}\" style=\"background:#0f766e;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600\">Sign in to PharmaCare</a></p>" +
            "<p style=\"margin:0 0 8px;font-weight:600\">Getting started</p>" +
            "<ol style=\"margin:0 0 16px;padding-left:20px;line-height:1.6\">" +
            "<li>Sign in and change this temporary password from your profile.</li>" +
            "<li>Turn on two-step verification for your account.</li>" +
            "<li>Check your branch details, then add your staff and give each the right role.</li>" +
            "<li>Add your medicines and opening stock, then start selling.</li></ol>" +
            "<p style=\"margin:0 0 12px;padding:12px;background:#fef3c7;border-radius:6px;color:#78350f\">" +
            "Keep this email private. It contains a password. PharmaCare staff will never ask you for it.</p>" +
            "<p style=\"margin:0\">Welcome aboard,<br/>The PharmaCare team</p>" +
            "</div></div>";

        return (subject, body);
    }

    private static string E(string value) => WebUtility.HtmlEncode(value);
}

namespace FSH.Modules.Identity.Services.Google;

/// <summary>
/// "GoogleAuth" configuration section. Google sign-in/sign-up is switched off while <see cref="ClientIds"/>
/// is empty (the default). Set it to the OAuth 2.0 web client id(s) from Google Cloud Console — the same
/// value the web app uses as NEXT_PUBLIC_GOOGLE_CLIENT_ID.
/// </summary>
public sealed class GoogleAuthOptions
{
    public const string SectionName = "GoogleAuth";

    public IReadOnlyList<string> ClientIds { get; set; } = [];

    /// <summary>OpenID discovery document Google publishes its signing keys through.</summary>
    public Uri MetadataAddress { get; set; } = new("https://accounts.google.com/.well-known/openid-configuration");
}

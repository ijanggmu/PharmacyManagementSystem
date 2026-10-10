using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace FSH.Modules.Identity.Services.Google;

/// <summary>Supplies Google's current token-signing keys (abstracted so tests can use their own key).</summary>
public interface IGoogleSigningKeyProvider
{
    Task<IReadOnlyCollection<SecurityKey>> GetSigningKeysAsync(CancellationToken ct = default);
}

/// <summary>Reads the keys from Google's OpenID discovery document. <see cref="ConfigurationManager{T}"/>
/// caches them and refreshes on its own schedule, so this is a singleton.</summary>
public sealed class GoogleSigningKeyProvider : IGoogleSigningKeyProvider
{
    private readonly ConfigurationManager<OpenIdConnectConfiguration> _configurationManager;

    public GoogleSigningKeyProvider(IOptions<GoogleAuthOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);
        _configurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
            options.Value.MetadataAddress.ToString(),
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever { RequireHttps = true });
    }

    public async Task<IReadOnlyCollection<SecurityKey>> GetSigningKeysAsync(CancellationToken ct = default)
    {
        var configuration = await _configurationManager.GetConfigurationAsync(ct).ConfigureAwait(false);
        return configuration.SigningKeys.ToList();
    }
}

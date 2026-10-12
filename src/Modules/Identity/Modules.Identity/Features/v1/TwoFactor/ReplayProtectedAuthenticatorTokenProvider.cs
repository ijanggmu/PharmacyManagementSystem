using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using FSH.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;

namespace FSH.Modules.Identity.Features.v1.TwoFactor;

/// <summary>
/// Authenticator (TOTP) token provider that refuses to accept the same code twice. ASP.NET Identity's
/// built-in <see cref="AuthenticatorTokenProvider{TUser}"/> accepts any code in a ±2 step (±90s) window, so an
/// observed code can be replayed until it ages out. This provider performs the same RFC 6238 check, then
/// records the matched time step in the user's token store and rejects any code whose step is not newer than
/// the last one accepted. Registered under the default authenticator provider name, so every caller
/// (login, external login, verify-enrollment) gets the protection.
/// </summary>
public sealed class ReplayProtectedAuthenticatorTokenProvider : AuthenticatorTokenProvider<FshUser>
{
    /// <summary>Login-provider name of the token-store row holding the last accepted step.</summary>
    public const string TokenStoreProvider = "[FshAuthenticator]";

    /// <summary>Token-store row name holding the last accepted time step.</summary>
    public const string LastTimeStepTokenName = "LastUsedTimeStep";

    private readonly TimeProvider _timeProvider;

    public ReplayProtectedAuthenticatorTokenProvider(TimeProvider timeProvider)
    {
        _timeProvider = timeProvider;
    }

    public override async Task<bool> ValidateAsync(string purpose, string token, UserManager<FshUser> manager, FshUser user)
    {
        ArgumentNullException.ThrowIfNull(manager);
        ArgumentNullException.ThrowIfNull(user);

        var key = await manager.GetAuthenticatorKeyAsync(user).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        var matchedStep = TotpCodes.FindMatchingTimeStep(key, token.Replace(" ", string.Empty, StringComparison.Ordinal).Replace("-", string.Empty, StringComparison.Ordinal), _timeProvider.GetUtcNow());
        if (matchedStep is null)
        {
            return false;
        }

        var lastUsed = await manager.GetAuthenticationTokenAsync(user, TokenStoreProvider, LastTimeStepTokenName).ConfigureAwait(false);
        if (long.TryParse(lastUsed, NumberStyles.Integer, CultureInfo.InvariantCulture, out var lastStep)
            && matchedStep.Value <= lastStep)
        {
            // Replay (or an older code after a newer one was used).
            return false;
        }

        // Persisting goes through UpdateAsync, which checks the user's concurrency stamp: if a concurrent
        // request accepted the same code first, this write fails and the code is rejected here.
        var stored = await manager.SetAuthenticationTokenAsync(
                user,
                TokenStoreProvider,
                LastTimeStepTokenName,
                matchedStep.Value.ToString(CultureInfo.InvariantCulture))
            .ConfigureAwait(false);

        return stored.Succeeded;
    }
}

/// <summary>RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30s steps) — the parameters ASP.NET Identity uses.</summary>
public static class TotpCodes
{
    private const int StepSeconds = 30;

    /// <summary>Identity accepts codes up to two steps (90s with rounding) either side of now.</summary>
    private const int AllowedDriftSteps = 2;

    /// <summary>Returns the time step that <paramref name="code"/> matches within the allowed drift, or null.</summary>
    public static long? FindMatchingTimeStep(string base32Key, string code, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(base32Key);
        if (!int.TryParse(code, NumberStyles.None, CultureInfo.InvariantCulture, out var numericCode))
        {
            return null;
        }

        var keyBytes = FromBase32(base32Key);
        var currentStep = CurrentTimeStep(now);
        for (var offset = -AllowedDriftSteps; offset <= AllowedDriftSteps; offset++)
        {
            var step = currentStep + offset;
            if (ComputeTotp(keyBytes, step) == numericCode)
            {
                return step;
            }
        }

        return null;
    }

    /// <summary>The code an authenticator app would show at <paramref name="now"/> (used by tests).</summary>
    public static string GenerateCode(string base32Key, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(base32Key);
        return ComputeTotp(FromBase32(base32Key), CurrentTimeStep(now)).ToString("D6", CultureInfo.InvariantCulture);
    }

    // Matches Identity: Math.Round of the unix seconds, then integer division by the step.
    private static long CurrentTimeStep(DateTimeOffset now) =>
        Convert.ToInt64(Math.Round((now.UtcDateTime - DateTime.UnixEpoch).TotalSeconds)) / StepSeconds;

    [System.Diagnostics.CodeAnalysis.SuppressMessage(
        "Security",
        "CA5350:Do Not Use Weak Cryptographic Algorithms",
        Justification = "RFC 6238 / authenticator apps (and ASP.NET Identity) use HMAC-SHA1; HMAC-SHA1 is not affected by SHA-1 collisions.")]
    private static int ComputeTotp(byte[] key, long timeStep)
    {
        Span<byte> counter = stackalloc byte[8];
        BinaryPrimitives.WriteInt64BigEndian(counter, timeStep);

        Span<byte> hash = stackalloc byte[20];
        HMACSHA1.HashData(key, counter, hash);

        var offset = hash[^1] & 0x0F;
        var binary = ((hash[offset] & 0x7F) << 24)
                     | (hash[offset + 1] << 16)
                     | (hash[offset + 2] << 8)
                     | hash[offset + 3];
        return binary % 1_000_000;
    }

    private static byte[] FromBase32(string input)
    {
        const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var trimmed = input.TrimEnd('=').ToUpperInvariant();
        var output = new byte[trimmed.Length * 5 / 8];
        int buffer = 0, bitsLeft = 0, index = 0;
        foreach (var c in trimmed)
        {
            var value = Alphabet.IndexOf(c, StringComparison.Ordinal);
            if (value < 0)
            {
                throw new FormatException("Invalid base32 character in authenticator key.");
            }

            buffer = ((buffer << 5) | value) & 0xFFFF;
            bitsLeft += 5;
            if (bitsLeft >= 8)
            {
                output[index++] = (byte)(buffer >> (bitsLeft - 8));
                bitsLeft -= 8;
            }
        }

        return output;
    }
}

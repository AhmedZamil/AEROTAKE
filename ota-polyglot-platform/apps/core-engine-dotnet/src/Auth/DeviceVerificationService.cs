using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;

namespace Ota.CoreEngine.Auth;

public interface IDeviceVerificationService
{
    Task<bool> IsKnownDeviceAsync(Guid userId, string? deviceToken, CancellationToken ct);

    /// <summary>Invalidates any prior unconsumed code for this user+purpose, generates a
    /// fresh one, emails it, and returns it (mainly for logging/testing — the caller
    /// should not return this value to the client).</summary>
    Task<string> GenerateAndSendCodeAsync(User user, VerificationPurpose purpose, CancellationToken ct);

    /// <summary>No hardcoded bypass — unlike AeroTake's VerifyController, every code must
    /// actually match what was emailed.</summary>
    Task<bool> VerifyCodeAsync(Guid userId, string code, VerificationPurpose purpose, CancellationToken ct);

    /// <summary>Call after a successful device-verification login so the client's
    /// returned device token is recognized next time.</summary>
    Task<string> RegisterDeviceAsync(Guid userId, CancellationToken ct);
}

public sealed class DeviceVerificationService(OtaDbContext db, IEmailSender emailSender) : IDeviceVerificationService
{
    private const string CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(15);

    public async Task<bool> IsKnownDeviceAsync(Guid userId, string? deviceToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(deviceToken)) return false;
        return await db.UserDevices.AnyAsync(d => d.UserId == userId && d.DeviceToken == deviceToken, ct);
    }

    public async Task<string> GenerateAndSendCodeAsync(User user, VerificationPurpose purpose, CancellationToken ct)
    {
        var stillPending = await db.VerificationCodes
            .Where(v => v.UserId == user.Id && v.Purpose == purpose && v.ConsumedAt == null)
            .ToListAsync(ct);
        foreach (var old in stillPending) old.ConsumedAt = DateTimeOffset.UtcNow; // superseded, not "used"

        var code = new string(Enumerable.Range(0, 8).Select(_ => CodeAlphabet[Random.Shared.Next(CodeAlphabet.Length)]).ToArray());
        db.VerificationCodes.Add(new VerificationCode
        {
            TenantId = user.TenantId,
            UserId = user.Id,
            Code = code,
            Purpose = purpose,
            ExpiresAt = DateTimeOffset.UtcNow.Add(CodeLifetime),
        });
        await db.SaveChangesAsync(ct);

        var subject = purpose == VerificationPurpose.DeviceVerification
            ? "Your AeroTake verification code"
            : "Your AeroTake password reset code";
        await emailSender.SendAsync(user.Email, subject, $"Your code is: {code}\nExpires in 15 minutes.", ct);

        return code;
    }

    public async Task<bool> VerifyCodeAsync(Guid userId, string code, VerificationPurpose purpose, CancellationToken ct)
    {
        var normalized = code.Trim().ToUpperInvariant();
        var now = DateTimeOffset.UtcNow;

        var match = await db.VerificationCodes
            .Where(v => v.UserId == userId && v.Purpose == purpose && v.ConsumedAt == null && v.ExpiresAt > now)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync(v => v.Code == normalized, ct);

        if (match is null) return false;

        match.ConsumedAt = now;
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<string> RegisterDeviceAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.IgnoreQueryFilters().SingleAsync(u => u.Id == userId, ct);
        var deviceToken = Guid.NewGuid().ToString("N");

        db.UserDevices.Add(new UserDevice { TenantId = user.TenantId, UserId = userId, DeviceToken = deviceToken });
        await db.SaveChangesAsync(ct);

        return deviceToken;
    }
}

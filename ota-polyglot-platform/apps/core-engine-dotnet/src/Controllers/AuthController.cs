using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.RateLimiting;

namespace Ota.CoreEngine.Controllers;

public sealed record RegisterRequest(string AgencyName, string Email, string Password, string FirstName, string LastName);
public sealed record LoginRequest(string Email, string Password, string? DeviceToken);
public sealed record VerifyDeviceRequest(Guid UserId, string Code);
public sealed record RefreshRequest(string RefreshToken);
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Email, string Code, string NewPassword);

public sealed record TokensResponse(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt, string? DeviceToken = null);
public sealed record DeviceVerificationRequiredResponse(bool DeviceVerificationRequired, Guid UserId);

/// <summary>
/// Ported from AeroTake's AuthenticatedSessionController/VerifyController/
/// RegisteredUserController/PasswordResetLinkController — as JWT issuance
/// instead of session cookies (gRPC has no cookie concept), and deliberately
/// WITHOUT the hardcoded '123456' device-verification bypass present in the
/// source. Every action here is [AllowAnonymous]; everything else in the
/// service requires a valid access token (see Program.cs).
/// </summary>
[ApiController]
[Route("api/v1/auth")]
[AllowAnonymous]
public sealed class AuthController(
    OtaDbContext db,
    IPasswordHasher passwordHasher,
    IJwtTokenService jwtTokenService,
    IDeviceVerificationService deviceVerification,
    IAbuseGuard guard,
    ILogger<AuthController> logger) : ControllerBase
{
    private static string? NormalizeEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.AgentRegisterPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            return BadRequest(new { error = "invalid_request", message = "Email is required and password must be at least 8 characters." });

        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();

        var emailTaken = await db.Users.AnyAsync(u => u.Email == request.Email, ct);
        if (emailTaken)
            return Conflict(new { error = "email_taken", message = "An account with this email already exists." });

        // Self-service signup creates a new agency (AeroTake's RegisteredUserController
        // behavior) — starts at the tenant's configured default tier (or Standard if
        // none is configured yet) with zero credit; an admin grants credit later.
        // AgentTier has no zero/Unspecified member, so the nullable cast + coalesce
        // is what correctly distinguishes "no default tier profile configured" from
        // "a profile is configured and happens to be Standard".
        var defaultTier = await db.AgentTierProfiles
            .Where(p => p.IsDefault && p.IsActive)
            .Select(p => (AgentTier?)p.Tier)
            .FirstOrDefaultAsync(ct) ?? AgentTier.Standard;

        var agent = new Agent
        {
            TenantId = tenantId,
            DisplayName = request.AgencyName,
            Email = request.Email,
            Tier = defaultTier,
            CreditLimit = 0m,
        };
        var user = new User
        {
            TenantId = tenantId,
            Email = request.Email,
            PasswordHash = passwordHasher.Hash(request.Password),
            FirstName = request.FirstName,
            LastName = request.LastName,
            Role = UserRole.AgencyAdmin,
            Agent = agent,
        };

        db.Agents.Add(agent);
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Registered user {UserId} for new agency {AgentId}", user.Id, agent.Id);
        return Created($"/api/v1/agents/{agent.Id}", new { userId = user.Id, agentId = agent.Id });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken ct)
    {
        var client = guard.ClientKey(HttpContext);
        if (await guard.HitAsync(HttpContext, AbuseLimits.AgentLoginPerIp, client, ct) is { } limited) return limited;
        if (await guard.CheckAsync(HttpContext, AbuseLimits.AgentLoginFailuresPerIp, client, ct) is { } locked) return locked;

        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();
        var addressKey = $"{tenantId}:{NormalizeEmail(request.Email) ?? ""}";
        if (await guard.CheckAsync(HttpContext, AbuseLimits.AgentLoginFailuresPerEmail, addressKey, ct) is { } lockedAddress) return lockedAddress;

        var user = await db.Users.Include(u => u.Agent)
            .FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive, ct);
        if (user is null || !passwordHasher.Verify(request.Password, user.PasswordHash))
        {
            await guard.RecordFailureAsync(AbuseLimits.AgentLoginFailuresPerIp, client, ct);
            await guard.RecordFailureAsync(AbuseLimits.AgentLoginFailuresPerEmail, addressKey, ct);
            return Unauthorized(new { error = "invalid_credentials", message = "Email or password is incorrect." });
        }

        // Admins have no Agent (AgentId is null for platform staff), so this
        // only ever blocks agency users — never an Admin login.
        if (user.Agent is not null && !user.Agent.IsActive)
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "agency_deactivated", message = "Your agency account has been deactivated. Please contact your account manager." });

        if (await deviceVerification.IsKnownDeviceAsync(user.Id, request.DeviceToken, ct))
        {
            var tokens = jwtTokenService.IssueTokens(user);
            return Ok(new TokensResponse(tokens.AccessToken, tokens.RefreshToken, tokens.AccessTokenExpiresAt));
        }

        await deviceVerification.GenerateAndSendCodeAsync(user, VerificationPurpose.DeviceVerification, ct);
        return Ok(new DeviceVerificationRequiredResponse(true, user.Id));
    }

    [HttpPost("verify-device")]
    public async Task<IActionResult> VerifyDevice(VerifyDeviceRequest request, CancellationToken ct)
    {
        var client = guard.ClientKey(HttpContext);
        if (await guard.HitAsync(HttpContext, AbuseLimits.AgentVerifyDevicePerIp, client, ct) is { } limited) return limited;

        var userKey = request.UserId.ToString("N");
        if (await guard.CheckAsync(HttpContext, AbuseLimits.AgentVerifyDeviceFailuresPerUser, userKey, ct) is { } locked) return locked;

        var verified = await deviceVerification.VerifyCodeAsync(request.UserId, request.Code, VerificationPurpose.DeviceVerification, ct);
        if (!verified)
        {
            await guard.RecordFailureAsync(AbuseLimits.AgentVerifyDeviceFailuresPerUser, userKey, ct);
            return BadRequest(new { error = "invalid_code", message = "Verification code is invalid or expired." });
        }

        var user = await db.Users.SingleAsync(u => u.Id == request.UserId, ct);
        var deviceToken = await deviceVerification.RegisterDeviceAsync(user.Id, ct);
        var tokens = jwtTokenService.IssueTokens(user);

        return Ok(new TokensResponse(tokens.AccessToken, tokens.RefreshToken, tokens.AccessTokenExpiresAt, deviceToken));
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(RefreshRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.AgentRefreshPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;

        var userId = jwtTokenService.ValidateRefreshToken(request.RefreshToken);
        if (userId is null)
            return Unauthorized(new { error = "invalid_refresh_token", message = "Refresh token is invalid or expired." });

        var user = await db.Users.IgnoreQueryFilters().SingleOrDefaultAsync(u => u.Id == userId && u.IsActive, ct);
        if (user is null)
            return Unauthorized(new { error = "invalid_refresh_token", message = "Refresh token is invalid or expired." });

        var tokens = jwtTokenService.IssueTokens(user);
        return Ok(new TokensResponse(tokens.AccessToken, tokens.RefreshToken, tokens.AccessTokenExpiresAt));
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.AgentForgotPasswordPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;

        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();
        var accepted = Ok(new { message = "If that email is registered, a reset code has been sent." });

        // Silent per-address limit so an attacker cannot fill a stranger's inbox (and cannot learn whether the address exists).
        var address = NormalizeEmail(request.Email);
        if (address is null || !await guard.AllowQuietlyAsync(AbuseLimits.AgentForgotPasswordPerEmail, $"{tenantId}:{address}", ct))
            return accepted;

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive, ct);
        if (user is not null)
            await deviceVerification.GenerateAndSendCodeAsync(user, VerificationPurpose.PasswordReset, ct);

        return accepted;
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.AgentResetPasswordPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (request.NewPassword.Length < 8)
            return BadRequest(new { error = "invalid_request", message = "Password must be at least 8 characters." });

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive, ct);
        if (user is null)
            return BadRequest(new { error = "invalid_code", message = "Reset code is invalid or expired." });

        var verified = await deviceVerification.VerifyCodeAsync(user.Id, request.Code, VerificationPurpose.PasswordReset, ct);
        if (!verified)
            return BadRequest(new { error = "invalid_code", message = "Reset code is invalid or expired." });

        user.PasswordHash = passwordHasher.Hash(request.NewPassword);
        await db.SaveChangesAsync(ct);

        return Ok(new { message = "Password has been reset." });
    }
}

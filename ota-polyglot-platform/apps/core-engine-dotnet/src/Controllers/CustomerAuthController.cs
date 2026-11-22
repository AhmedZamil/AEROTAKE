using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ota.CoreEngine.Auth;
using Ota.CoreEngine.Bookings;
using Ota.CoreEngine.CustomerAuth;
using Ota.CoreEngine.RateLimiting;
using Ota.CoreEngine.Data;
using Ota.CoreEngine.Domain;
using Ota.CoreEngine.SharedKernel;
using Ota.CoreEngine.Tenancy;

namespace Ota.CoreEngine.Controllers;

public sealed record SocialSignInRequest(string? Provider, string? IdToken, string? Nonce);
public sealed record CustomerRefreshRequest(string? RefreshToken);
public sealed record CustomerProfile(Guid Id, string? Email, bool EmailVerified, string? FirstName, string? LastName, string? Phone);
public sealed record CustomerSessionResponse(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt, CustomerProfile Customer, bool IsNewCustomer, int AttachedGuestBookings = 0);
public sealed record ClaimBookingRequest(string? ClaimToken);
public sealed record CustomerRegisterRequest(string? Email, string? Password, string? Phone = null, string? FirstName = null, string? LastName = null, string? CaptchaToken = null);
public sealed record CustomerPasswordLoginRequest(string? Email, string? Password, string? CaptchaToken = null);
public sealed record CustomerEmailTokenRequest(string? Token);
public sealed record CustomerForgotPasswordRequest(string? Email, string? CaptchaToken = null);
public sealed record CustomerResetPasswordRequest(string? Token, string? Password);

/// <summary>Consumer sign-in and session endpoints for the B2C storefront. No passwords and no OTP: the customer proves who they
/// are to an identity provider (Google), the storefront sends us the provider's ID token, and WE verify it — signature, issuer,
/// audience, expiry, nonce — before believing a word of it. We then issue our own customer tokens.
///
/// Anonymous by nature (there is no session yet), so the tenant comes from X-Tenant-ID, as for every anonymous endpoint — but
/// unlike the agent endpoints it is checked here: the tenant must be a registered, active B2C tenant, otherwise anyone could
/// create accounts inside any tenant id they liked.</summary>
[ApiController]
[Route("api/v1/auth/customer")]
[AllowAnonymous]
public sealed class CustomerAuthController(
    OtaDbContext db,
    IStorefrontTenants storefronts,
    IEnumerable<IExternalIdentityVerifier> verifiers,
    IGuestAccessService guests,
    ICustomerSignInService signIn,
    ICustomerPasswordService passwords,
    ICaptchaVerifier captcha,
    IEmailSender email,
    ICustomerTokenService tokens,
    ICustomerSessions sessions,
    IAbuseGuard guard,
    ILogger<CustomerAuthController> logger) : ControllerBase
{
    private const int MaxTokenLength = 8192;

    [HttpPost("social")]
    public async Task<IActionResult> Social(SocialSignInRequest request, CancellationToken ct)
    {
        var client = guard.ClientKey(HttpContext);
        if (await guard.HitAsync(HttpContext, AbuseLimits.SignInPerIp, client, ct) is { } limited) return limited;
        if (await guard.CheckAsync(HttpContext, AbuseLimits.SignInFailuresPerIp, client, ct) is { } locked) return locked;

        var provider = request.Provider?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(provider) || string.IsNullOrWhiteSpace(request.IdToken) || request.IdToken.Length > MaxTokenLength)
            return BadRequest(new { error = "invalid_request", message = "provider and idToken are required." });

        var verifier = verifiers.FirstOrDefault(v => v.Provider == provider);
        if (verifier is null)
            return BadRequest(new { error = "unsupported_provider", message = $"Sign-in with '{provider}' is not supported." });
        if (!verifier.IsConfigured)
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "provider_not_configured", message = $"Sign-in with {provider} is not available yet." });

        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();
        if (!await storefronts.IsB2CAsync(tenantId, ct))
            return NotFound(new { error = "unknown_tenant", message = "This site does not accept customer sign-in." });

        var identity = await verifier.VerifyAsync(request.IdToken, request.Nonce, ct);
        if (identity is null)
        {
            await guard.RecordFailureAsync(AbuseLimits.SignInFailuresPerIp, client, ct);
            logger.LogInformation("Rejected an invalid {Provider} ID token for tenant {TenantId}", provider, tenantId);
            return Unauthorized(new { error = "invalid_provider_token", message = "The sign-in could not be verified." });
        }

        CustomerSignIn result;
        try { result = await signIn.SignInAsync(tenantId, identity, ct); }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.PermissionDenied)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "account_unavailable", message = ex.Message });
        }

        // Bookings made as a guest with a mailbox the provider has now vouched for join this account. Never blocks the sign-in.
        var attached = 0;
        if (result.Customer.EmailVerified && result.Customer.Email is { } verifiedEmail)
        {
            try { attached = await guests.AttachByVerifiedEmailAsync(result.Customer.Id, verifiedEmail, ct); }
            catch (Exception ex) { logger.LogError(ex, "Could not attach guest bookings for customer {CustomerId}", result.Customer.Id); }
        }

        var issued = tokens.Issue(result.Customer);
        logger.LogInformation("Customer {CustomerId} signed in with {Provider} on tenant {TenantId} (new: {IsNew})", result.Customer.Id, provider, tenantId, result.IsNewCustomer);
        return Ok(new CustomerSessionResponse(issued.AccessToken, issued.RefreshToken, issued.AccessTokenExpiresAt, ToProfile(result.Customer), result.IsNewCustomer, attached));
    }

    // ------------------------------------------------------------------------------------------ email + password

    private async Task<IActionResult?> RejectUnlessStorefrontAsync(CancellationToken ct) =>
        await storefronts.IsB2CAsync(HttpContext.Request.Headers["X-Tenant-ID"].ToString(), ct)
            ? null
            : NotFound(new { error = "unknown_tenant", message = "This site does not accept customer sign-in." });

    private async Task<IActionResult> SessionAsync(Customer customer, bool isNew, CancellationToken ct)
    {
        // Bookings made as a guest join the account only through a mailbox that is VERIFIED — never on an unconfirmed address.
        var attached = 0;
        if (customer.EmailVerified && customer.Email is { } verified)
        {
            try { attached = await guests.AttachByVerifiedEmailAsync(customer.Id, verified, ct); }
            catch (Exception ex) { logger.LogError(ex, "Could not attach guest bookings for customer {CustomerId}", customer.Id); }
        }
        var issued = tokens.Issue(customer);
        return Ok(new CustomerSessionResponse(issued.AccessToken, issued.RefreshToken, issued.AccessTokenExpiresAt, ToProfile(customer), isNew, attached));
    }

    /// <summary>The "are you a person?" answer, or null if the request may go on (the check is off, or passed).</summary>
    private async Task<IActionResult?> CaptchaFailureAsync(string? token, CancellationToken ct) =>
        await captcha.VerifyAsync(token, guard.ClientKey(HttpContext), ct)
            ? null
            : BadRequest(new { error = "captcha_failed", message = "We couldn't confirm you are a person. Please try again." });

    private async Task SendAsync(string to, string subject, string body, string what, CancellationToken ct)
    {
        try { await email.SendAsync(to, subject, body, ct); }
        catch (Exception ex) { logger.LogError(ex, "Could not send the {What} email", what); } // never a signal to the caller
    }

    /// <summary>Create an account with just a name, an email and a password. Signs the customer in at once; the email is unconfirmed until they
    /// open the link we send, and only a confirmed email can join earlier guest bookings or a Google login.</summary>
    [HttpPost("register")]
    public async Task<IActionResult> Register(CustomerRegisterRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.RegisterPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (await RejectUnlessStorefrontAsync(ct) is { } rejected) return rejected;
        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();
        if (string.IsNullOrWhiteSpace(request.Email) || request.Password is null)
            return BadRequest(new { error = "invalid_request", message = "Email and password are required." });
        if (await CaptchaFailureAsync(request.CaptchaToken, ct) is { } notHuman) return notHuman;

        PasswordRegistration result;
        try { result = await passwords.RegisterAsync(tenantId, request.Email, request.Password, request.Phone, request.FirstName, request.LastName, ct); }
        catch (ServiceException ex) { return BadRequest(new { error = "invalid_request", message = ex.Message }); }

        if (result.Outcome == RegisterOutcome.EmailTaken)
            return Conflict(new { error = "email_taken", message = "An account with this email already exists. Sign in, or use “Forgot password” to set a new password." });

        await SendVerificationAsync(tenantId, result.Customer!, result.VerifyToken, ct);
        logger.LogInformation("Customer {CustomerId} registered with a password on tenant {TenantId}", result.Customer!.Id, tenantId);
        return await SessionAsync(result.Customer, isNew: true, ct);
    }

    private async Task SendVerificationAsync(string tenantId, Customer customer, string? token, CancellationToken ct)
    {
        var baseUrl = token is null ? null : await storefronts.PublicBaseUrlAsync(tenantId, ct);
        if (baseUrl is null || customer.Email is null) return;
        await SendAsync(customer.Email, "Confirm your email address",
            $"Welcome{(customer.FirstName is null ? "" : $", {customer.FirstName}")}!\n\nConfirm your email address so we can connect your bookings to your account:\n\n{baseUrl}/verify-email#token={token}\n\nThe link works once and expires in 2 days. If you did not create an account, ignore this email.", "verification", ct);
    }

    /// <summary>Sign in with email and password. A wrong email and a wrong password get the SAME answer; repeated failures for an address (from
    /// anywhere) or from a client are refused for a while.</summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login(CustomerPasswordLoginRequest request, CancellationToken ct)
    {
        var client = guard.ClientKey(HttpContext);
        if (await guard.HitAsync(HttpContext, AbuseLimits.SignInPerIp, client, ct) is { } limited) return limited;
        if (await guard.CheckAsync(HttpContext, AbuseLimits.SignInFailuresPerIp, client, ct) is { } locked) return locked;
        if (await RejectUnlessStorefrontAsync(ct) is { } rejected) return rejected;
        if (string.IsNullOrWhiteSpace(request.Email) || request.Password is null || request.Password.Length > 1000)
            return BadRequest(new { error = "invalid_request", message = "Email and password are required." });

        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();
        var addressKey = $"{tenantId}:{CustomerPasswordService.Normalize(request.Email) ?? request.Email.Trim().ToLowerInvariant()}";
        if (await guard.CheckAsync(HttpContext, AbuseLimits.LoginFailuresPerEmail, addressKey, ct) is { } lockedAddress) return lockedAddress;

        // A normal sign-in never meets a CAPTCHA. After a few failures for this address or from this client, the next attempt must carry one —
        // so guessing costs an attacker a solved challenge each time, and a customer who simply mistyped is not asked for anything.
        if (captcha.IsEnabled
            && Math.Max(await guard.RecentFailuresAsync(AbuseLimits.LoginFailuresPerEmail, addressKey, ct), await guard.RecentFailuresAsync(AbuseLimits.SignInFailuresPerIp, client, ct)) >= AbuseLimits.CaptchaAfterFailures)
        {
            if (string.IsNullOrWhiteSpace(request.CaptchaToken)) return Unauthorized(new { error = "captcha_required", message = "One quick check before you try again." });
            if (await CaptchaFailureAsync(request.CaptchaToken, ct) is { } notHuman) return notHuman;
        }

        var customer = await passwords.LoginAsync(request.Email, request.Password, ct);
        if (customer is null)
        {
            await guard.RecordFailureAsync(AbuseLimits.SignInFailuresPerIp, client, ct);
            await guard.RecordFailureAsync(AbuseLimits.LoginFailuresPerEmail, addressKey, ct);
            return Unauthorized(new { error = "invalid_credentials", message = "That email and password do not match." });
        }
        logger.LogInformation("Customer {CustomerId} signed in with a password on tenant {TenantId}", customer.Id, tenantId);
        return await SessionAsync(customer, isNew: false, ct);
    }

    /// <summary>Redeems the link from the confirmation email.</summary>
    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail(CustomerEmailTokenRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.TokenRedeemPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (await RejectUnlessStorefrontAsync(ct) is { } rejected) return rejected;

        var customer = await passwords.VerifyEmailAsync(request.Token, ct);
        if (customer is null) return BadRequest(new { error = "invalid_token", message = "This link is no longer valid. Sign in and ask for a new one." });

        var attached = customer.Email is { } e ? await guests.AttachByVerifiedEmailAsync(customer.Id, e, ct) : 0;
        return Ok(new { verified = true, attachedGuestBookings = attached });
    }

    /// <summary>"I forgot my password": ALWAYS 202. A known address gets a reset link; an unknown one gets nothing; the caller cannot tell.</summary>
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(CustomerForgotPasswordRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.ForgotPasswordPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (await RejectUnlessStorefrontAsync(ct) is { } rejected) return rejected;
        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();
        var accepted = Accepted(new { message = "If there is an account for that email, we have sent a link to reset the password." });
        if (await CaptchaFailureAsync(request.CaptchaToken, ct) is { } notHuman) return notHuman;

        // Silent per-address limit (counted whether or not the account exists), so nobody can fill a stranger's inbox with reset mail.
        var address = CustomerPasswordService.Normalize(request.Email);
        if (address is null || !await guard.AllowQuietlyAsync(AbuseLimits.ForgotPasswordPerEmail, $"{tenantId}:{address}", ct)) return accepted;

        var started = await passwords.StartResetAsync(address, ct);
        var baseUrl = started is null ? null : await storefronts.PublicBaseUrlAsync(tenantId, ct);
        if (started is { } s && baseUrl is not null)
            await SendAsync(address, "Reset your password",
                $"Someone asked to reset the password for this account. To choose a new one, open:\n\n{baseUrl}/reset-password#token={s.Token}\n\nThe link works once and expires in 1 hour. If it was not you, ignore this email — your password has not changed.", "reset", ct);
        return accepted;
    }

    /// <summary>Sets the new password from the emailed link. Every session of that customer ends.</summary>
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(CustomerResetPasswordRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.TokenRedeemPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        if (await RejectUnlessStorefrontAsync(ct) is { } rejected) return rejected;
        if (request.Password is null) return BadRequest(new { error = "invalid_request", message = "A new password is required." });

        Customer? customer;
        try { customer = await passwords.ResetPasswordAsync(request.Token, request.Password, ct); }
        catch (ServiceException ex) { return BadRequest(new { error = "weak_password", message = ex.Message }); }
        if (customer is null) return BadRequest(new { error = "invalid_token", message = "This link is no longer valid. Ask for a new one." });

        if (customer.Email is { } e) await guests.AttachByVerifiedEmailAsync(customer.Id, e, ct);
        return NoContent();
    }

    /// <summary>Exchanges a refresh token for a new pair. The old refresh token stops working the moment it is used, so a copy
    /// stolen earlier is dead, and two simultaneous refreshes cannot both succeed.</summary>
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(CustomerRefreshRequest request, CancellationToken ct)
    {
        if (await guard.HitAsync(HttpContext, AbuseLimits.RefreshPerIp, guard.ClientKey(HttpContext), ct) is { } limited) return limited;
        var claims = string.IsNullOrWhiteSpace(request.RefreshToken) ? null : tokens.ReadRefreshToken(request.RefreshToken);
        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();

        // One answer for every failure: a caller learns nothing about which check failed.
        IActionResult Invalid() => Unauthorized(new { error = "invalid_refresh_token" });
        if (claims is null || claims.TenantId != tenantId) return Invalid();

        // Is the SESSION still good — not signed out, not cut off by sign-out-everywhere, customer still active? (Same check as every
        // customer request.) Then the token itself is single-use.
        if (!await sessions.IsValidAsync(claims.TenantId, claims.CustomerId, claims.SessionId, claims.IssuedAtMs, ct)) return Invalid();
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == claims.CustomerId, ct);
        if (customer is null) return Invalid();

        if (!await sessions.TryUseRefreshTokenAsync(claims.TokenId, claims.ExpiresAt, ct)) return Invalid(); // already used

        var issued = tokens.Issue(customer, claims.SessionId); // the same session continues
        return Ok(new CustomerSessionResponse(issued.AccessToken, issued.RefreshToken, issued.AccessTokenExpiresAt, ToProfile(customer), IsNewCustomer: false));
    }

    /// <summary>Ends THIS session: its refresh token can never be used again and every access token issued in the same chain stops working at once (not in
    /// 15 minutes). Other sessions of the same customer, on other devices, are untouched — see logout-all. Always 204 — including for a token that is
    /// invalid or already revoked — so the endpoint cannot be used to probe tokens. Only a genuinely signed token revokes anything.</summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CustomerRefreshRequest request, CancellationToken ct)
    {
        var claims = string.IsNullOrWhiteSpace(request.RefreshToken) ? null : tokens.ReadRefreshToken(request.RefreshToken);
        var tenantId = HttpContext.Request.Headers["X-Tenant-ID"].ToString();
        if (claims is not null && claims.TenantId == tenantId)
        {
            await sessions.EndSessionAsync(claims.SessionId, claims.ExpiresAt, ct);
            await sessions.TryUseRefreshTokenAsync(claims.TokenId, claims.ExpiresAt, ct);
        }
        return NoContent();
    }

    internal static CustomerProfile ToProfile(Customer c) => new(c.Id, c.Email, c.EmailVerified, c.FirstName, c.LastName, c.Phone);
}

/// <summary>The signed-in customer's own account. Requires a customer access token: an agent's token — valid everywhere else — is
/// refused here, because it is for a different audience.</summary>
[ApiController]
[Route("api/v1/customers")]
[Authorize(AuthenticationSchemes = CustomerBearer.Scheme, Policy = CustomerBearer.Policies.CustomerSelf)]
public sealed class CustomersController(OtaDbContext db, IGuestAccessService guests, ICustomerSessions sessions, IConsumerBookingService consumerBookings, IBookingCancellationService cancellations, Payments.IPaymentService payments, Payments.IWalletService wallets, Payments.IWalletTopUpService topUps, IHostEnvironment env, IConfiguration config, IAbuseGuard guard,
    ICustomerPasswordService passwords, IStorefrontTenants storefronts, IEmailSender email, ILogger<CustomersController> logger) : ControllerBase
{
    /// <summary>"Sign out everywhere": every session this customer has, on every device — access and refresh tokens alike — ends now.
    /// Sign in again to continue (a token issued after this moment is fine).</summary>
    [HttpPost("me/logout-all")]
    public async Task<IActionResult> LogoutAll(CancellationToken ct)
    {
        if (!Guid.TryParse(User.FindFirst("sub")?.Value, out var customerId) || User.FindFirst("tenant_id")?.Value is not { } tenant) return Unauthorized();
        await sessions.EndAllSessionsAsync(tenant, customerId, ct);
        return NoContent();
    }

    /// <summary>"Send the confirmation email again" for a signed-in customer whose address is not confirmed yet. Always 202.</summary>
    [HttpPost("me/resend-verification")]
    public async Task<IActionResult> ResendVerification(CancellationToken ct)
    {
        if (!Guid.TryParse(User.FindFirst("sub")?.Value, out var customerId) || User.FindFirst("tenant_id")?.Value is not { } tenant) return Unauthorized();
        if (await guard.HitAsync(HttpContext, AbuseLimits.ResendVerificationPerCustomer, $"{tenant}:{customerId}", ct) is { } limited) return limited;

        var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == customerId, ct);
        var token = customer is null ? null : await passwords.IssueVerificationAsync(customer, ct);
        var baseUrl = token is null ? null : await storefronts.PublicBaseUrlAsync(tenant, ct);
        if (customer?.Email is { } to && baseUrl is not null)
        {
            try
            {
                await email.SendAsync(to, "Confirm your email address",
                    $"Confirm your email address so we can connect your bookings to your account:\n\n{baseUrl}/verify-email#token={token}\n\nThe link works once and expires in 2 days.", ct);
            }
            catch (Exception ex) { logger.LogError(ex, "Could not send the verification email"); }
        }
        return Accepted();
    }

    /// <summary>The signed-in customer as the Caller the access rules speak.</summary>
    private Caller? CurrentCaller() =>
        Guid.TryParse(User.FindFirst("sub")?.Value, out var id) && User.FindFirst("tenant_id")?.Value is { } tenant
            ? new Caller(tenant, "B2C", null, ActorTypes.Customer, CustomerId: id)
            : null;

    /// <summary>Books as the signed-in customer: the booking is theirs from the start. Same rules as a guest's (price recomputed here, nothing paid yet).</summary>
    [HttpPost("me/bookings")]
    public async Task<IActionResult> Reserve(ReserveBookingRequest request, CancellationToken ct)
    {
        if (CurrentCaller() is not { } caller || caller.CustomerId is not { } customerId) return Unauthorized();
        if (await guard.HitAsync(HttpContext, AbuseLimits.CustomerBookPerCustomer, $"{caller.TenantId}:{customerId}", ct) is { } limited) return limited;

        return await ConsumerBookingResponses.ReserveAsync(this, () => consumerBookings.ReserveAsync(caller, request.ToService(), ct));
    }

    /// <summary>The customer's own bookings — and only theirs (Bookings.BookingOwnership).</summary>
    [HttpGet("me/bookings")]
    public async Task<IActionResult> MyBookings(CancellationToken ct)
    {
        if (CurrentCaller() is not { } caller) return Unauthorized();

        var bookings = await db.Bookings.VisibleTo(caller).OrderByDescending(b => b.CreatedAt).Take(50).ToListAsync(ct);
        return Ok(await cancellations.ToViewsAsync(bookings, ct));
    }

    /// <summary>P5-20: ask to cancel. Unpaid / paid-but-unticketed holds are cancelled (and refunded) here; a Confirmed ticket
    /// becomes a stored request for ops.</summary>
    [HttpPost("me/bookings/{bookingId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid bookingId, [FromBody] CancelBookingRequest? request, CancellationToken ct)
    {
        if (CurrentCaller() is not { } caller || caller.CustomerId is not { } customerId) return Unauthorized();
        if (await guard.HitAsync(HttpContext, AbuseLimits.CustomerCancelPerCustomer, $"{caller.TenantId}:{customerId}", ct) is { } limited) return limited;

        try
        {
            var view = await cancellations.RequestCancelAsync(caller, bookingId, request?.Reason, ct);
            return Ok(view);
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.NotFound)
        {
            return NotFound(new { error = "booking_not_found", message = ex.Message });
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.FailedPrecondition)
        {
            return Conflict(new { error = ex.Code ?? "cancel_not_allowed", message = ex.Message });
        }
    }

    /// <summary>The customer's Aerotake balance. Instant top-up is only offered in local development.</summary>
    [HttpGet("me/wallet")]
    public async Task<IActionResult> Wallet(CancellationToken ct)
    {
        if (CurrentCaller() is not { } caller) return Unauthorized();
        var balance = await wallets.GetAsync(caller, InstantTopUp(), ct);
        return Ok(new { balance = balance.Balance, currency = balance.Currency, instantTopUp = balance.InstantTopUp });
    }

    /// <summary>Starts a card checkout that adds money to the wallet only after SSLCommerz confirms the payment.</summary>
    [HttpPost("me/wallet/top-up/card")]
    public async Task<IActionResult> StartCardTopUp(WalletTopUpRequest? request, CancellationToken ct)
    {
        if (CurrentCaller() is not { } caller) return Unauthorized();
        try
        {
            var started = await topUps.StartCardAsync(caller, request?.Amount ?? 0, request?.IdempotencyKey, ct);
            return Ok(new { topUpId = started.TopUpId, gatewayUrl = started.GatewayPageUrl, amount = started.Amount, currency = started.Currency, replayed = started.Replayed });
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.FailedPrecondition)
        {
            return Conflict(new { error = ex.Code ?? "topup_unavailable", message = ex.Message });
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.InvalidArgument)
        {
            return BadRequest(new { error = "invalid_request", message = ex.Message });
        }
    }

    [HttpGet("me/wallet/top-ups/{topUpId:guid}")]
    public async Task<IActionResult> CardTopUp(Guid topUpId, CancellationToken ct)
    {
        if (CurrentCaller() is not { } caller) return Unauthorized();
        try
        {
            var view = await topUps.GetAsync(caller, topUpId, ct);
            return Ok(new { topUpId = view.TopUpId, status = view.Status, amount = view.Amount, currency = view.Currency, balance = view.Balance });
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.NotFound)
        {
            return NotFound(new { error = "topup_not_found", message = ex.Message });
        }
    }

    [HttpPost("me/wallet/top-up")]
    public async Task<IActionResult> TopUpWallet(WalletTopUpRequest? request, CancellationToken ct)
    {
        if (CurrentCaller() is not { } caller) return Unauthorized();
        try
        {
            var balance = await wallets.TopUpAsync(caller, request?.Amount ?? 0, InstantTopUp(), ct);
            return Ok(new { balance = balance.Balance, currency = balance.Currency, instantTopUp = balance.InstantTopUp });
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.FailedPrecondition)
        {
            return Conflict(new { error = ex.Code ?? "wallet_topup_unavailable", message = ex.Message });
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.InvalidArgument)
        {
            return BadRequest(new { error = "invalid_request", message = ex.Message });
        }
    }

    /// <summary>Pays a Pending booking the customer owns. Method wallet spends the Aerotake balance. Anything else starts SSLCommerz and returns the gateway URL.</summary>
    [HttpPost("me/bookings/{bookingId:guid}/pay")]
    public async Task<IActionResult> StartPay(Guid bookingId, [FromBody] StartPayRequest? request, CancellationToken ct)
    {
        if (CurrentCaller() is not { } caller) return Unauthorized();
        try
        {
            var result = await payments.StartAsync(caller, new Payments.StartPaymentRequest(bookingId, request?.IdempotencyKey, request?.Method ?? "sslcommerz"), ct);
            return Ok(new
            {
                paymentId = result.PaymentId,
                tranId = result.TranId,
                gatewayUrl = result.GatewayPageUrl,
                replayed = result.Replayed,
                method = result.Method,
                paid = result.Paid,
                bookingStatus = result.BookingStatus,
            });
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.NotFound)
        {
            return NotFound(new { error = "booking_not_found", message = ex.Message });
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.FailedPrecondition)
        {
            return Conflict(new { error = ex.Code ?? "payment_unavailable", message = ex.Message });
        }
        catch (ServiceException ex) when (ex.Kind == ErrorKind.InvalidArgument)
        {
            return BadRequest(new { error = "invalid_request", message = ex.Message });
        }
    }

    /// <summary>Adds a booking made as a guest to this account, using the token from its emailed link. A token for a booking that
    /// belongs to someone else, or is unknown or expired, gets the same 404.</summary>
    [HttpPost("me/bookings/claim")]
    public async Task<IActionResult> ClaimBooking(ClaimBookingRequest request, CancellationToken ct)
    {
        if (CurrentCaller() is not { } caller || caller.CustomerId is not { } customerId) return Unauthorized();

        var outcome = await guests.ClaimAsync(customerId, request.ClaimToken, ct);
        return outcome == ClaimOutcome.NotFound
            ? NotFound(new { error = "booking_not_found", message = "We couldn't find a booking with those details." })
            : Ok(new { claimed = outcome == ClaimOutcome.Attached });
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        if (!Guid.TryParse(User.FindFirst("sub")?.Value, out var customerId)) return Unauthorized();

        // The tenant filter (from the token) means a customer id from another tenant is simply not found.
        var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == customerId, ct);
        if (customer is null || !customer.IsActive || customer.DeletedAt is not null) return Unauthorized();

        return Ok(CustomerAuthController.ToProfile(customer));
    }

    private bool InstantTopUp() =>
        env.IsDevelopment() || string.Equals(config["Wallet:InstantTopUp"], "true", StringComparison.OrdinalIgnoreCase);
}

public sealed record StartPayRequest(string? IdempotencyKey, string? Method);
public sealed record WalletTopUpRequest(decimal Amount, string? IdempotencyKey = null);
public sealed record CancelBookingRequest(string? Reason);
using Ota.CoreEngine.Grpc;

namespace Ota.CoreEngine.Suppliers;

/// <summary>
/// The aggregator: the single ISupplierProvider the rest of the system sees
/// once more than a stub is configured. Search fans out to every supplier in
/// parallel under one deadline (a slow or dead supplier can't block or fail
/// the others); every other call is routed to the owning supplier by the
/// offer-id prefix ("SABRE-…", "HAJEE-…") or, for ticketing, the supplier
/// code stored on the booking. Merging duplicates needs the agent's markup,
/// which lives in the gRPC layer — see OfferMerger.
/// </summary>
public sealed class CompositeSupplierProvider(
    IEnumerable<ISupplierProvider> providers,
    IOfferAlternatesReader alternatesReader,
    ILogger<CompositeSupplierProvider> logger) : ISupplierProvider
{
    private readonly IReadOnlyList<ISupplierProvider> _providers = providers.ToList();

    /// <summary>How long a search over ALL suppliers waits (the default).</summary>
    public TimeSpan SearchDeadline { get; init; } = TimeSpan.FromSeconds(18);

    /// <summary>The quick suppliers alone (filter speed=fast): a slow one is not asked, so this can be short.</summary>
    public TimeSpan FastSearchDeadline { get; init; } = TimeSpan.FromSeconds(22); // room for one stalled attempt (8 s) plus a retry of a 3-5 s search

    /// <summary>The slow suppliers alone (filter speed=slow): given enough time to send what they have, since nothing waits for them.</summary>
    public TimeSpan SlowSearchDeadline { get; init; } = TimeSpan.FromSeconds(45);

    public string SupplierCode => "COMPOSITE";

    private static string DisplayName(string code) => code switch
    {
        "SABRE" => "Sabre",
        "HAJEE" => "Hajee Air",
        _ => code,
    };

    private ISupplierProvider? ProviderFor(string offerId) =>
        _providers.FirstOrDefault(p => offerId.StartsWith(p.SupplierCode + "-", StringComparison.OrdinalIgnoreCase));

    // ------------------------------ Search ---------------------------------

    public async Task<IReadOnlyList<SupplierOfferResult>> SearchAsync(SearchRequest request, CancellationToken ct) =>
        (await SearchWithWarningsAsync(request, ct)).Offers;

    public async Task<SupplierSearchOutcome> SearchWithWarningsAsync(SearchRequest request, CancellationToken ct)
    {
        // speed=fast / speed=slow asks for only the quick or only the slow suppliers; anything else asks for all of them.
        request.Filters.TryGetValue("speed", out var speed);
        var chosen = speed switch
        {
            "fast" => _providers.Where(p => !p.IsSlowSearch).ToList(),
            "slow" => _providers.Where(p => p.IsSlowSearch).ToList(),
            _ => _providers.ToList(),
        };

        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(speed switch { "fast" => FastSearchDeadline, "slow" => SlowSearchDeadline, _ => SearchDeadline });

        var attempts = await Task.WhenAll(chosen.Select(async provider =>
        {
            try
            {
                var offers = await provider.SearchAsync(request, deadline.Token);
                return (Provider: provider, Offers: offers, Failed: false);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                // Includes our own deadline firing. The caller cancelling
                // (ct) is NOT swallowed — that's the client hanging up.
                logger.LogError(ex, "{Supplier} search failed or timed out; continuing with the other suppliers.", provider.SupplierCode);
                return (Provider: provider, Offers: (IReadOnlyList<SupplierOfferResult>)[], Failed: true);
            }
        }));

        var all = attempts.SelectMany(a => a.Offers).ToList();
        var warnings = attempts
            .Where(a => a.Failed)
            .Select(a => $"{DisplayName(a.Provider.SupplierCode)} results are temporarily unavailable, so some fares may be missing.")
            .ToList();

        return new SupplierSearchOutcome(all, warnings);
    }

    // ------------------------------ Routed calls ---------------------------

    public Task<decimal?> GetCachedNetRateAsync(string offerId, CancellationToken ct) =>
        ProviderFor(offerId) is { } p ? p.GetCachedNetRateAsync(offerId, ct) : Task.FromResult<decimal?>(null);

    public Task<decimal> GetCachedTaxAmountAsync(string offerId, CancellationToken ct) =>
        ProviderFor(offerId) is { } p ? p.GetCachedTaxAmountAsync(offerId, ct) : Task.FromResult(0m);

    public async Task<RevalidateResult> RevalidateAsync(string offerId, decimal expectedNetRate, CancellationToken ct)
    {
        var provider = ProviderFor(offerId);
        if (provider is null) return new RevalidateResult(false, 0, "Unknown supplier for this offer. Please search again.");

        var result = await provider.RevalidateAsync(offerId, expectedNetRate, ct);
        if (result.FailureReason is null) return result; // matched, or a price change the UI will explain

        // The chosen offer is gone. If another supplier still sells the same
        // itinerary (recorded at merge time), offer that instead — the caller
        // shows it as a price change against the replacement offer.
        foreach (var alt in await alternatesReader.GetAsync(offerId))
        {
            var altProvider = ProviderFor(alt);
            var altNet = altProvider is null ? null : await altProvider.GetCachedNetRateAsync(alt, ct);
            if (altProvider is null || altNet is null) continue;

            var altResult = await altProvider.RevalidateAsync(alt, altNet.Value, ct);
            if (altResult.FailureReason is null)
            {
                logger.LogInformation("Offer {Offer} failed to reprice ({Reason}); falling back to {Alt}.", offerId, result.FailureReason, alt);
                return new RevalidateResult(false, altResult.CurrentNetRate, null, altResult.CurrentTaxAmount, ReplacementOfferId: alt);
            }
        }

        return result;
    }

    public Task<SupplierBookingResult> CreateBookingAsync(B2BBookingRequest request, CancellationToken ct) =>
        ProviderFor(request.OfferId) is { } p
            ? p.CreateBookingAsync(request, ct)
            : Task.FromResult(new SupplierBookingResult(false, null, "Unknown supplier for this offer.", "{}"));

    public Task<TicketIssueResult> IssueTicketAsync(string supplierCode, string supplierPnrId, decimal finalPrice, CancellationToken ct) =>
        _providers.FirstOrDefault(p => p.SupplierCode.Equals(supplierCode, StringComparison.OrdinalIgnoreCase)) is { } p
            ? p.IssueTicketAsync(supplierCode, supplierPnrId, finalPrice, ct)
            : Task.FromResult(new TicketIssueResult(false, $"No configured supplier '{supplierCode}' to issue this ticket.", "{}"));

    public Task CancelHoldAsync(string supplierCode, string supplierPnrId, CancellationToken ct) =>
        _providers.FirstOrDefault(p => p.SupplierCode.Equals(supplierCode, StringComparison.OrdinalIgnoreCase)) is { } p
            ? p.CancelHoldAsync(supplierCode, supplierPnrId, ct)
            : Task.CompletedTask;
}

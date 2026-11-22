namespace Ota.CoreEngine.SharedKernel;

/// <summary>Values of the "actor_type" claim: what kind of principal the token represents.</summary>
public static class ActorTypes
{
    public const string Agent = "agent";
    public const string Customer = "customer";
    public const string Guest = "guest";
    public const string Service = "service";

    public const string ClaimName = "actor_type";
}

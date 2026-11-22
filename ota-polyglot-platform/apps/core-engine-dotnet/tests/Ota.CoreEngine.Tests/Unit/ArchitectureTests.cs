using NetArchTest.Rules;
using Xunit;

namespace Ota.CoreEngine.Tests.Unit;

/// <summary>The module boundaries as build-breaking rules (P1-4). core-engine is one deployable organised into
/// modules by namespace; these tests are what keeps them modules and stops them eroding into a tangle. A
/// physical project split waits for per-module DbContexts (P2-2) — until then the rules, not project
/// references, are the wall.
///
/// The shape (an arrow means "may depend on"):
///   Grpc adapter, Controllers  -> the application services and anything below
///   Bookings -> Pricing, Ledger, Suppliers, Messaging      Search -> Pricing, Suppliers
///   Payments -> Bookings (ownership) ; SSLCommerz adapter is behind IPaymentGateway
///   Pricing, Ledger, Suppliers, Messaging, Auth: independent of each other and of Bookings/Search
///   Everything -> SharedKernel, Data/Domain (the shared data model, until P2-2), Tenancy
///   Nothing depends on the adapters, and no application service touches the gRPC/HTTP transport.</summary>
public class ArchitectureTests
{
    private static readonly System.Reflection.Assembly Core = typeof(Program).Assembly;
    private const string Root = "Ota.CoreEngine";

    // The transport adapter types. (The namespace Ota.CoreEngine.Grpc also holds the generated contract messages,
    // which every module may use — so the adapters are named individually.)
    private static readonly string[] Adapters =
    [
        $"{Root}.Grpc.OtaCoreGrpcService", $"{Root}.Grpc.GrpcCallerResolver",
        $"{Root}.Grpc.IGrpcCallerResolver", $"{Root}.Grpc.ServiceExceptionInterceptor",
        $"{Root}.Controllers",
    ];

    private static readonly string[] Transport = ["Grpc.Core", "Microsoft.AspNetCore"];

    private static void AssertNoDependency(string module, params string[] forbidden)
    {
        var result = Types.InAssembly(Core).That().ResideInNamespace($"{Root}.{module}")
            .ShouldNot().HaveDependencyOnAny(forbidden).GetResult();

        Assert.True(result.IsSuccessful,
            $"{module} must not depend on [{string.Join(", ", forbidden)}] but {string.Join(", ", result.FailingTypeNames ?? [])} do.");
    }

    private static string[] Modules(params string[] names) => names.Select(n => $"{Root}.{n}").ToArray();

    private static string[] Plus(string[] a, params string[][] more) => a.Concat(more.SelectMany(x => x)).ToArray();

    [Fact]
    public void ThereAreTypesInEveryModule_SoTheRulesBelowAreNotVacuous()
    {
        foreach (var module in new[] { "SharedKernel", "Suppliers", "Pricing", "Ledger", "Search", "Bookings", "Payments", "Messaging", "Auth", "CustomerAuth" })
            Assert.NotEmpty(Types.InAssembly(Core).That().ResideInNamespace($"{Root}.{module}").GetTypes());
    }

    [Fact]
    public void SharedKernel_DependsOnNoOtherModule() =>
        AssertNoDependency("SharedKernel",
            Plus(Modules("Suppliers", "Pricing", "Ledger", "Search", "Bookings", "Payments", "Messaging", "Auth", "CustomerAuth", "Tenancy", "Data", "Domain", "Observability"), Adapters, Transport));

    [Fact]
    public void Suppliers_KnowNothingAboutTheDatabaseOrAnyOtherModule() =>
        // The point of the module: it could be lifted into its own service (supplier gateway) without dragging anything
        // along. It may use the contract messages, Redis and HTTP — never the data model, and never a caller above it.
        AssertNoDependency("Suppliers",
            Plus(Modules("Data", "Domain", "Pricing", "Ledger", "Search", "Bookings", "Messaging", "Auth", "Tenancy", "Observability"), Adapters, Transport.Where(t => t != "Microsoft.AspNetCore").ToArray()));

    [Fact]
    public void Pricing_IsIndependentOfWhoUsesIt() =>
        AssertNoDependency("Pricing", Plus(Modules("Suppliers", "Ledger", "Search", "Bookings", "Messaging", "Auth"), Adapters, Transport));

    [Fact]
    public void Ledger_IsIndependentOfWhoUsesIt() =>
        AssertNoDependency("Ledger", Plus(Modules("Suppliers", "Pricing", "Search", "Bookings", "Messaging", "Auth"), Adapters, Transport));

    [Fact]
    public void Search_DoesNotReachIntoBookingsOrMoneyMovement() =>
        AssertNoDependency("Search", Plus(Modules("Bookings", "Ledger", "Messaging", "Auth"), Adapters, Transport));

    [Fact]
    public void Bookings_DoesNotReachIntoSearchOrIdentity() =>
        // May use Payments.IPaymentGateway to refund when ticketing fails after a paid IPN (P4-5).
        // May use Auth.IEmailSender for B2C transactional mail (P5-18/P5-21) — SMTP lives with Auth today; not JWT/identity.
        AssertNoDependency("Bookings", Plus(Modules("Search", "CustomerAuth"), Adapters, Transport));

    [Fact]
    public void Payments_DoesNotReachIntoSearchIdentityOrMoneyMovementElsewhere() =>
        // Starts hosted checkout and records Payment rows; ticketing (P4-5) stays in Bookings. May use Bookings ownership helpers.
        AssertNoDependency("Payments", Plus(Modules("Search", "Auth", "CustomerAuth", "Messaging", "Ledger", "Pricing", "Suppliers"), Adapters, Transport));

    [Fact]
    public void Messaging_IsIndependentOfTheModulesThatPublishThroughIt() =>
        AssertNoDependency("Messaging", Plus(Modules("Suppliers", "Pricing", "Ledger", "Search", "Bookings", "Payments", "Auth"), Adapters, Transport));

    [Fact]
    public void Auth_DoesNotDependOnBookingsSearchOrSuppliers() =>
        AssertNoDependency("Auth", Plus(Modules("Suppliers", "Pricing", "Ledger", "Search", "Bookings", "Messaging"),
            Adapters.Where(a => a != $"{Root}.Controllers").ToArray())); // Auth's own controllers live in Controllers; only the adapters are off limits

    [Fact]
    public void CustomerAuth_IsSelfContained_ItKnowsNothingOfBookingsSearchOrSuppliers() =>
        // Consumer sign-in issues tokens and finds/creates customers; it does not book, search, price or publish events. (It may use
        // ASP.NET's authentication types — it defines an auth scheme, like Auth's gRPC one — so Transport is not forbidden here.)
        AssertNoDependency("CustomerAuth", Plus(Modules("Suppliers", "Pricing", "Ledger", "Search", "Bookings", "Messaging"),
            Adapters.Where(a => a != $"{Root}.Controllers").ToArray()));

    [Fact]
    public void NoOtherModule_DependsOnCustomerSignIn()
    {
        // Who a customer is reaches the rest of the system only as a Caller (SharedKernel), never as a reference to this module.
        foreach (var module in new[] { "SharedKernel", "Suppliers", "Pricing", "Ledger", "Search", "Bookings", "Payments", "Messaging", "Auth" })
            AssertNoDependency(module, $"{Root}.CustomerAuth");
    }

    [Fact]
    public void TheAdapters_AreLeaves_NothingBelowThemReachesUp()
    {
        foreach (var lower in new[] { "SharedKernel", "Suppliers", "Pricing", "Ledger", "Search", "Bookings", "Payments", "Messaging", "Data", "Domain", "Tenancy" })
            AssertNoDependency(lower, Adapters);
    }
}

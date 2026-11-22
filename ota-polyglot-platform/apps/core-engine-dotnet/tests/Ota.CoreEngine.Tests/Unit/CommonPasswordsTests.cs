using Ota.CoreEngine.CustomerAuth;
using Xunit;

namespace Ota.CoreEngine.Tests.Unit;

/// <summary>The password rule is "8 or more characters and not one attackers try first" — no capitals/digits/symbols rule to satisfy.</summary>
public class CommonPasswordsTests
{
    [Theory]
    [InlineData("password")]
    [InlineData("Password123")]          // a listed word + digits
    [InlineData("welcome2024!")]         // + digits and a symbol
    [InlineData("iloveyou99")]
    [InlineData("Aerotake2026")]         // the brand itself
    [InlineData("P@ssw0rd")]
    [InlineData("12345678")]
    [InlineData("87654321")]             // a run backwards
    [InlineData("abcdefgh")]
    [InlineData("qwertyuiop")]           // a keyboard row
    [InlineData("aaaaaaaa")]
    [InlineData("11111111")]
    [InlineData("  password  ")]
    [InlineData("QWERTY123")]
    [InlineData("123password")]
    public void TheFirstThingsAnAttackerTries_AreRefused(string password) => Assert.True(CommonPasswords.IsCommon(password), password);

    [Theory]
    [InlineData("correct horse battery")]
    [InlineData("blue-tiger-4-lamps")]
    [InlineData("MyDogSkipper")]
    [InlineData("sunrise over dhaka")]
    [InlineData("Tr0ub4dor&3")]
    [InlineData("mangolassi")]
    [InlineData("k9#fWq2!zL")]
    [InlineData("passwordless-thinking")] // contains a listed word but is not a listed word plus digits
    public void OrdinaryGoodPasswords_AreNotRefused_NoCapitalDigitOrSymbolRule(string password) => Assert.False(CommonPasswords.IsCommon(password), password);
}

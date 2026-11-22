namespace Ota.CoreEngine.CustomerAuth;

/// <summary>Passwords that attackers try first. The rule for customers is deliberately simple — 8 or more characters, and not one of these —
/// because a password that is easy to type but is on the list falls in the first minute of a guessing attack, whereas "must contain a symbol,
/// a capital and a digit" only makes people write "Password1!". So there is no composition rule; there is a blocklist.
///
/// A password is refused if it (lower-cased) is on the list, is the same character repeated, is a run of consecutive digits or letters
/// ("12345678", "abcdefgh"), or is a listed word with only digits/symbols added on the end ("password123", "welcome2024!", "qwerty1").</summary>
public static class CommonPasswords
{
    // The most-used passwords (of any length; those under 8 characters can never be chosen anyway, but appear here so that "base + digits"
    // variants — "iloveyou99", "sunshine1" — are recognised).
    private static readonly HashSet<string> Words = new(StringComparer.Ordinal)
    {
        "password", "passw0rd", "p@ssw0rd", "p@ssword", "pa55word", "pass1234", "passpass", "password1", "letmein", "welcome", "welcome1", "admin", "administrator",
        "qwerty", "qwertyui", "qwertyuiop", "qwerty123", "qwertyu", "asdfghjk", "asdfghjkl", "asdfgh", "zxcvbnm", "zxcvbnm123", "1qaz2wsx", "1q2w3e4r", "1q2w3e4r5t",
        "iloveyou", "ilovemyself", "ilovegod", "monkey", "dragon", "master", "shadow", "sunshine", "princess", "football", "baseball", "basketball", "superman", "batman",
        "starwars", "trustno1", "whatever", "freedom", "michael", "jennifer", "jordan", "charlie", "maggie", "buster", "daniel", "hunter", "harley", "ranger", "thomas",
        "robert", "soccer", "hockey", "killer", "george", "andrew", "joshua", "matthew", "jessica", "ashley", "nicole", "hannah", "amanda", "summer", "winter", "spring",
        "internet", "computer", "changeme", "default", "guest", "secret", "access", "login", "hello", "hello123", "helloworld", "abc123", "abcd1234", "abcdefgh", "abcdefg",
        "test", "testing", "test1234", "tester", "user", "username", "root", "toor", "temp", "temppass", "welcome123", "mypassword", "mypass", "yourpassword", "newpassword",
        "aerotake", "aerotake1", "flight", "flights", "travel", "traveller", "traveler", "booking", "airline", "airways", "airport", "dhaka", "bangladesh", "bangla", "bengali",
        "allahuakbar", "bismillah", "mashallah", "inshallah", "alhamdulillah", "muhammad", "mohammad", "ahmed", "rahman", "hossain", "islam", "karim", "rahim", "jannat",
        "iloveu", "iloveyou1", "loveyou", "lovely", "love", "lover", "babygirl", "baby", "angel", "angels", "flower", "cookie", "chocolate", "butterfly", "purple", "orange",
        "pepper", "ginger", "cheese", "banana", "cherry", "cricket", "tigers", "liverpool", "arsenal", "chelsea", "barcelona", "realmadrid", "manchester", "messi", "ronaldo",
        "samsung", "iphone", "google", "facebook", "youtube", "gmail", "yahoo", "hotmail", "outlook", "amazon", "netflix", "windows", "microsoft", "apple", "android",
        "q1w2e3r4", "q1w2e3r4t5", "qazwsxedc", "qazwsx", "zaq12wsx", "1qazxsw2", "wsxedcrfv", "poiuytrewq", "lkjhgfdsa", "mnbvcxz", "qweasdzxc", "qweasd", "asd123", "asdasd",
        "aaaaaa", "aaaaaaaa", "zzzzzz", "google123", "root123", "admin123", "admin1234", "administrator1", "adminadmin", "letmein1", "letmein123", "iloveyou123", "monkey123",
        "dragon123", "football1", "baseball1", "superman1", "sunshine1", "princess1", "shadow1", "master123", "master1", "trustno1", "1234", "12345", "123456", "1234567",
        "12345678", "123456789", "1234567890", "0123456789", "987654321", "9876543210", "111111", "11111111", "000000", "00000000", "121212", "123123", "123321", "112233",
        "654321", "666666", "696969", "159753", "147258369", "123qwe", "123qweasd", "123abc", "1234qwer", "12341234", "1234abcd", "19871987", "20202020", "20242024", "20252025",
        "bangladesh1", "dhaka123", "bangladesh123", "ilovebangladesh", "aerotake123",
    };

    private const string Digits = "0123456789";
    private const string Letters = "abcdefghijklmnopqrstuvwxyz";
    private const string KeyboardRows = "qwertyuiopasdfghjklzxcvbnm";

    /// <summary>True if this password would be among the first an attacker tries.</summary>
    public static bool IsCommon(string password)
    {
        var p = password.Trim().ToLowerInvariant();
        if (p.Length == 0) return true;
        if (Words.Contains(p)) return true;
        if (p.Distinct().Count() == 1) return true;                            // "aaaaaaaa", "11111111"
        if (IsRun(p)) return true;                                               // "12345678", "abcdefgh", "87654321", "qwertyui"

        // a listed word with only digits/symbols added: "password123", "welcome2024!", "iloveyou99"
        var stem = p.TrimEnd(p.Reverse().TakeWhile(c => !char.IsLetter(c)).ToArray());
        if (stem.Length >= 4 && stem.Length < p.Length && Words.Contains(stem)) return true;
        var leading = p.TrimStart(p.TakeWhile(c => !char.IsLetter(c)).ToArray());  // "123password"
        if (leading.Length >= 4 && leading.Length < p.Length && Words.Contains(leading)) return true;
        return false;
    }

    /// <summary>A run of characters that follow one another in the digits, the alphabet, or a keyboard row — forwards or backwards.</summary>
    private static bool IsRun(string p)
    {
        if (p.Length < 6) return false;
        foreach (var source in new[] { Digits, Letters, KeyboardRows })
        {
            if (source.Contains(p, StringComparison.Ordinal)) return true;
            var reversed = new string(p.Reverse().ToArray());
            if (source.Contains(reversed, StringComparison.Ordinal)) return true;
        }
        return false;
    }
}

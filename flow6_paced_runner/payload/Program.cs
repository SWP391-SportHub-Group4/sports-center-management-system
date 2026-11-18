using System.Diagnostics;
using System.Net;
using System.Text.Json;
using System.Xml.Linq;
using SportHub.AI.Application.DTOs.Chat;
using SportHub.AI.Application.Interfaces;
using SportHub.AI.Application.Services.Flow6;
using SportHub.AI.Infrastructure.Python;
using SportHub.AI.Prompts;
using SportHub.BuildingBlocks.SharedKernel.Errors;

// Live Gemini through the actual role-specific Python providers, with synthetic evidence only.
// This runner never uses a production DB, JWT, user ID or API key from its command line.
internal static class Program
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static readonly DateTime Now = new(2026, 11, 17, 9, 0, 0, DateTimeKind.Utc);
    private static readonly HashSet<string> Infra = new(StringComparer.Ordinal)
    {
        "ai_provider_rate_limited", "ai_quota_exceeded", "ai_provider_unavailable", "ai_service_unavailable",
        "ai_provider_timeout", "ai_service_timeout", "ai_provider_auth_failed", "ai_model_unavailable"
    };

    public static async Task<int> Main(string[] args)
    {
        try
        {
            var cases = JsonSerializer.Deserialize<TestCase[]>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "cases.json")), Json)
                ?? throw new InvalidOperationException("Missing cases.");
            using var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures.json")));
            var data = fixtures.RootElement;
            ValidateMatrix(cases, data);
            if (args.Contains("--self-test", StringComparer.Ordinal))
            {
                Console.WriteLine("SELF_TEST_OK: 60 Member and 60 Coach cases, fixtures and topic allowlists validated. No live provider call.");
                return 0;
            }
            string Option(string name, string fallback)
            {
                var i = Array.IndexOf(args, name);
                if (i < 0) return fallback;
                if (i == args.Length - 1 || args[i + 1].StartsWith("--", StringComparison.Ordinal))
                    throw new ArgumentException("Missing value for " + name);
                return args[i + 1];
            }
            for (var i = 0; i < args.Length; i += 2)
                if (args[i] is not ("--role" or "--group" or "--id" or "--max-cases" or "--max-calls" or "--python-url" or "--min-call-interval-seconds" or "--resume-from"))
                    throw new ArgumentException("Unknown option: " + args[i]);
            var role = Option("--role", "all").ToLowerInvariant();
            var group = Option("--group", "all").ToLowerInvariant();
            var id = Option("--id", "");
            var maxCases = int.Parse(Option("--max-cases", "100"));
            var maxCalls = int.Parse(Option("--max-calls", "300"));
            var interval = int.Parse(Option("--min-call-interval-seconds", "12"));
            if (interval < 0 || interval > 60) throw new ArgumentException("Call interval must be between 0 and 60 seconds.");
            var resumePath = Option("--resume-from", "");
            HashSet<string>? resumeIds = null;
            if (resumePath.Length > 0)
            {
                if (id.Length > 0) throw new ArgumentException("Use either --id or --resume-from.");
                using var previous = JsonDocument.Parse(File.ReadAllText(resumePath));
                resumeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var item in previous.RootElement.GetProperty("results").EnumerateArray())
                {
                    var status = item.GetProperty("status").GetString();
                    if (status is "INFRA_ERROR" or "NOT_RUN")
                        resumeIds.Add(item.GetProperty("case").GetProperty("id").GetString() ?? throw new ArgumentException("Missing case ID."));
                }
            }
            if (role is not ("all" or "member" or "coach") || group is not ("all" or "happy" or "unhappy") || maxCases <= 0 || maxCalls <= 0)
                throw new ArgumentException("Invalid options.");
            var selected = cases.Where(c => (role == "all" || c.Role == role) && (group == "all" || c.Group == group) &&
                (id.Length == 0 || c.Id.Equals(id, StringComparison.OrdinalIgnoreCase)) && (resumeIds is null || resumeIds.Contains(c.Id))).Take(maxCases).ToArray();
            if (selected.Length == 0) throw new ArgumentException("No matching case.");
            var uri = new Uri(Option("--python-url", "http://127.0.0.1:8001"));
            if (uri.Scheme != "http" || !uri.IsLoopback || uri.UserInfo.Length != 0 || uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.Fragment.Length != 0)
                throw new ArgumentException("Use an explicit loopback HTTP Python service URL only.");
            using var http = new HttpClient(new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false })
            { BaseAddress = uri, Timeout = TimeSpan.FromSeconds(90) };
            var budget = new Budget(maxCalls, TimeSpan.FromSeconds(interval));
            var results = new List<Result>();
            var canRun = false;
            try
            {
                using var healthTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(8));
                using var health = await http.GetAsync("/health", healthTimeout.Token);
                canRun = health.IsSuccessStatusCode;
                Console.WriteLine($"Health: HTTP {(int)health.StatusCode}");
            }
            catch (Exception ex) { Console.WriteLine("Health failed: " + ex.GetType().Name); }
            if (!canRun)
            {
                foreach (var c in selected) results.Add(new(c, "NOT_RUN", "Python service health preflight failed; no Gemini call.", null, [], 0, false));
                Save(results, budget.Used);
                return 2;
            }
            string? stop = null;
            var factory = new LocalFactory(http);
            foreach (var c in selected)
            {
                if (stop is not null || budget.Used >= budget.Max)
                {
                    results.Add(new(c, "NOT_RUN", stop ?? "Provider call budget exhausted.", null, [], 0, false));
                    continue;
                }
                var underlying = c.Role == "member" ? (IAiChatProvider)new PythonAiChatProvider(factory) : new PythonCoachChatProvider(factory);
                var trace = new TraceProvider(underlying, budget);
                var watch = Stopwatch.StartNew();
                var fetched = new List<string>();
                Flow6Result? result = null;
                string status, actual;
                try
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(120));
                    Task<object> Load(string topic, CancellationToken ct)
                    {
                        ct.ThrowIfCancellationRequested();
                        fetched.Add(topic);
                        return Task.FromResult<object>(data.GetProperty(c.Role).GetProperty(topic).Clone());
                    }
                    result = c.Role == "member"
                        ? await MemberFlow6Chat.RunAsync(trace, SportHubAssistantSystemPrompt.Content, c.Question, c.PreviousQuestion, Now, Load, timeout.Token)
                        : await CoachFlow6Chat.RunAsync(trace, CoachAiSystemPrompt.Content, c.Question, c.PreviousQuestion, Now, Load, timeout.Token);
                    var errors = new List<string>();
                    if (!c.ExpectedIntents.Contains(result.Plan.Intent, StringComparer.Ordinal)) errors.Add("Wrong intent: " + result.Plan.Intent);
                    if (result.Plan.Language != c.Language) errors.Add("Wrong language: " + result.Plan.Language);
                    if (c.RequiredTopics.Any(t => !fetched.Contains(t, StringComparer.Ordinal))) errors.Add("Required evidence was not loaded.");
                    if (c.NoEvidence && fetched.Count != 0) errors.Add("Evidence loaded for a no-data intent.");
                    if (c.NoEvidence && result.Plan.Topics.Count != 0) errors.Add("No-data intent returned topics.");
                    if (!fetched.SequenceEqual(result.Plan.Topics)) errors.Add("Evidence/plan mismatch.");
                    if (trace.Calls.Any(x => x.PreviousInteractionId is not null)) errors.Add("Unsafe provider history forwarded.");
                    if (trace.Calls.Count != result.ProviderCalls || trace.Calls.Count > 3) errors.Add("Provider call contract mismatch.");
                    if (trace.Calls.Any(x => !string.Equals(x.Question, c.Question, StringComparison.Ordinal))) errors.Add("Original question changed.");
                    if (trace.Calls.Any(x => x.Context.Contains("OUTSIDE_SCOPE_SENTINEL", StringComparison.Ordinal))) errors.Add("Out-of-scope sentinel sent.");
                    foreach (var alternatives in c.RequiredAnswerAny)
                        if (!alternatives.Any(x => result.Answer.Contains(x, StringComparison.OrdinalIgnoreCase)))
                            errors.Add("Missing expected answer anchor: " + string.Join(" / ", alternatives));
                    foreach (var forbidden in c.ForbiddenAnswer)
                        if (result.Answer.Contains(forbidden, StringComparison.OrdinalIgnoreCase)) errors.Add("Forbidden output anchor: " + forbidden);
                    status = errors.Count == 0 ? "PASS" : "FAIL";
                    actual = errors.Count == 0 ? result.Answer : string.Join("; ", errors);
                }
                catch (BudgetException) { status = "NOT_RUN"; actual = "Provider budget prevented completion."; stop = actual; }
                catch (AppException ex)
                {
                    status = Infra.Contains(ex.ErrorCode) ? "INFRA_ERROR" : "FAIL";
                    actual = $"HTTP {ex.StatusCode} [{ex.ErrorCode}]";
                    if (ex.ErrorCode is "ai_provider_rate_limited" or "ai_quota_exceeded")
                        stop = "Rate limit encountered; remaining cases not run. Resume from this report after quota recovers.";
                }
                catch (OperationCanceledException) { status = "INFRA_ERROR"; actual = "Case timeout before verified output."; }
                catch (HttpRequestException) { status = "INFRA_ERROR"; actual = "HTTP transport failed."; }
                catch (Exception ex) { status = "FAIL"; actual = "Unexpected " + ex.GetType().Name; }
                watch.Stop();
                // PASS means the explicit automated checks passed, not that every statement is factually/professionally correct.
                var review = result is not null && result.Plan.Intent is not ("OFF_TOPIC" or "PRIVACY_DENIED" or "ACTION_DENIED");
                results.Add(new(c, status, actual, result, trace.Calls, watch.ElapsedMilliseconds, review));
                Console.WriteLine($"{c.Id} {status} ({trace.Calls.Count} provider calls)");
            }
            Save(results, budget.Used);
            return results.All(r => r.Status == "PASS") ? 0 : results.Any(r => r.Status == "FAIL") ? 1 : 2;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Runner failed: {ex.GetType().Name}: {ex.Message}");
            return 2;
        }
    }

    private static void ValidateMatrix(TestCase[] cases, JsonElement data)
    {
        if (cases.Length != 120 || cases.Select(c => c.Id).Distinct(StringComparer.Ordinal).Count() != 120)
            throw new InvalidOperationException("Expected 120 unique cases.");
        foreach (var role in new[] { "member", "coach" })
        {
            var allowed = role == "member" ? MemberFlow6Chat.AllowedTopics : CoachFlow6Chat.AllowedTopics;
            var actual = data.GetProperty(role).EnumerateObject().Select(x => x.Name).ToArray();
            if (!allowed.ToHashSet(StringComparer.Ordinal).SetEquals(actual)) throw new InvalidOperationException(role + " fixture topics mismatch.");
            var subset = cases.Where(c => c.Role == role).ToArray();
            if (subset.Length != 60 || !subset.Select(c => c.Language).ToHashSet().SetEquals(new[] { "en", "vi" }) ||
                subset.Any(c => c.Question.Trim().Length == 0 || c.Question.Length > 2000 || c.ExpectedIntents.Length == 0 ||
                    c.RequiredTopics.Any(t => !allowed.Contains(t, StringComparer.Ordinal)) || (c.NoEvidence && c.RequiredTopics.Length != 0)))
                throw new InvalidOperationException(role + " case matrix is invalid.");
        }
    }

    private static void Save(List<Result> results, int calls)
    {
        var dir = Path.Combine(Directory.GetCurrentDirectory(), "flow6-live-tests", "reports", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff"));
        Directory.CreateDirectory(dir);
        var counts = results.GroupBy(r => r.Status).ToDictionary(g => g.Key, g => g.Count());
        File.WriteAllText(Path.Combine(dir, "results.json"), JsonSerializer.Serialize(new { version = "Flow6 V2", syntheticEvidence = true, providerCalls = calls, counts, results }, Json));
        static string Esc(string value) => WebUtility.HtmlEncode(value);
        var summary = string.Join(" / ", counts.Select(x => x.Key + " " + x.Value));
        var html = "<!doctype html><meta charset=utf-8><title>Flow6 V2 live</title><style>body{font:15px system-ui;max-width:1200px;margin:24px auto;padding:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f0f0;padding:16px}details{border:1px solid #ccc;padding:10px;margin:10px 0}</style>" +
            "<h1>Flow6 V2 — live Gemini, synthetic evidence</h1><p>" + Esc(summary) + "</p><p>Provider calls: " + calls + "</p><p>PASS covers explicit checks only. Review the actual response for semantic grounding, appropriateness and language. This is not a production DB or UI test.</p>";
        foreach (var r in results) html += "<details><summary>" + Esc(r.Case.Id + " " + r.Status + " " + r.Case.Question) + "</summary><pre>" + Esc(JsonSerializer.Serialize(r, Json)) + "</pre></details>";
        File.WriteAllText(Path.Combine(dir, "index.html"), html);
        var suite = new XElement("testsuite", new XAttribute("tests", results.Count),
            new XAttribute("failures", results.Count(r => r.Status == "FAIL")),
            new XAttribute("skipped", results.Count(r => r.Status is "NOT_RUN" or "INFRA_ERROR")));
        foreach (var r in results)
        {
            var item = new XElement("testcase", new XAttribute("name", r.Case.Id), new XAttribute("classname", r.Case.Role),
                new XAttribute("time", (r.ElapsedMs / 1000.0).ToString(System.Globalization.CultureInfo.InvariantCulture)));
            if (r.Status == "FAIL") item.Add(new XElement("failure", r.Actual));
            if (r.Status is "NOT_RUN" or "INFRA_ERROR") item.Add(new XElement("skipped", r.Actual));
            suite.Add(item);
        }
        new XDocument(suite).Save(Path.Combine(dir, "junit.xml"));
        Console.WriteLine(Path.Combine(dir, "index.html"));
    }

    private sealed record TestCase(string Id, string Role, string Category, string Group, string Question,
        string Language, string[] ExpectedIntents, string[] RequiredTopics, bool NoEvidence,
        string[][] RequiredAnswerAny, string[] ForbiddenAnswer, string? PreviousQuestion, string ReviewCriteria);
    private sealed record Result(TestCase Case, string Status, string Actual, Flow6Result? Output,
        IReadOnlyList<Trace> Calls, long ElapsedMs, bool SemanticReviewRequired);
    private sealed record Trace(string Stage, string Context, string Question, string? PreviousInteractionId,
        string? Answer, string? Model, string? Error);
    private sealed class LocalFactory(HttpClient client) : IHttpClientFactory { public HttpClient CreateClient(string name) => client; }
    private sealed class Budget(int max, TimeSpan interval)
    {
        public int Max { get; } = max;
        public int Used { get; set; }
        private readonly Stopwatch clock = Stopwatch.StartNew();
        private TimeSpan? lastStart;
        public async Task WaitAsync(CancellationToken ct)
        {
            if (lastStart is { } previous)
            {
                var wait = interval - (clock.Elapsed - previous);
                if (wait > TimeSpan.Zero) await Task.Delay(wait, ct);
            }
            lastStart = clock.Elapsed;
        }
    }
    private sealed class BudgetException : Exception { }
    private sealed class TraceProvider(IAiChatProvider inner, Budget budget) : IAiChatProvider
    {
        public List<Trace> Calls { get; } = [];
        public async Task<AiProviderResponse> AskAsync(string systemPrompt, string context, string question,
            string? previousInteractionId = null, CancellationToken cancellationToken = default)
        {
            if (budget.Used >= budget.Max) throw new BudgetException();
            await budget.WaitAsync(cancellationToken);
            budget.Used++;
            var stage = systemPrompt.Contains("SPORTHUB FLOW6 INTENT PLANNER", StringComparison.Ordinal) ? "planning" : "answer";
            try
            {
                var response = await inner.AskAsync(systemPrompt, context, question, previousInteractionId, cancellationToken);
                Calls.Add(new(stage, context, question, previousInteractionId, response.Answer, response.Model, null));
                return response;
            }
            catch (AppException ex) { Calls.Add(new(stage, context, question, previousInteractionId, null, null, ex.ErrorCode)); throw; }
            catch (Exception ex) { Calls.Add(new(stage, context, question, previousInteractionId, null, null, ex.GetType().Name)); throw; }
        }
    }
}

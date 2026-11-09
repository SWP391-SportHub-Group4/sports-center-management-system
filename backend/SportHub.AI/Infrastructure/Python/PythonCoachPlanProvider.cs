namespace SportHub.AI.Infrastructure.Python;

/// <summary>Dedicated Coach teaching-plan suggestion/validation gateway.</summary>
public sealed class PythonCoachPlanProvider(IHttpClientFactory factory) : PythonAiChatProvider(factory)
{
    protected override string ChatEndpoint => "/coach/plan";
}

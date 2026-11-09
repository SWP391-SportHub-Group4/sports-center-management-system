namespace SportHub.AI.Infrastructure.Python;

/// <summary>Dedicated Coach chat gateway; never used by Member or Workout Validation.</summary>
public sealed class PythonCoachChatProvider(IHttpClientFactory factory) : PythonAiChatProvider(factory)
{
    protected override string ChatEndpoint => "/coach/chat";
}

namespace SportHub.AI.Domain.Constants;

public static class AiQueryTypes
{
    public const string WorkoutSuggestion =
        "WORKOUT_SUGGESTION";

    // Presentation/source classification for Member workout suggestions.
    // Do not change WorkoutSuggestion above: existing AiLog queries depend on it.
    public const string WorkoutSuggestionSourceType = "AI_SUGGESTION";

    public const string Chat =
        "CHAT";

    public const string ManagerScheduleSuggestion =
        "MANAGER_SCHEDULE_SUGGESTION";
}
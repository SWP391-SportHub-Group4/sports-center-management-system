using SportHub.AI.Prompts;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class SportHubAssistantSystemPromptTests
{
    [Theory]
    [InlineData("What do I have today?", "CURRENT RESPONSE LANGUAGE: English")]
    [InlineData("When does my membership end?", "CURRENT RESPONSE LANGUAGE: English")]
    [InlineData("Hôm nay tôi có lịch gì?", "CURRENT RESPONSE LANGUAGE: Vietnamese")]
    [InlineData("Hom nay toi co lich gi?", "CURRENT RESPONSE LANGUAGE: Vietnamese")]
    [InlineData("What is my lịch hôm nay?", "CURRENT RESPONSE LANGUAGE: Vietnamese")]
    public void Current_question_sets_an_explicit_response_language(string question, string expected)
    {
        Assert.Contains(expected, SportHubAssistantSystemPrompt.ForQuestion(question));
    }

    [Fact]
    public void Ambiguous_question_keeps_the_general_language_rule()
    {
        Assert.Equal(SportHubAssistantSystemPrompt.Content,
            SportHubAssistantSystemPrompt.ForQuestion("Badminton 101"));
    }
}

using System.Reflection;
using SportHub.AI.Application.Services;
using SportHub.AI.Infrastructure.Python;
using SportHub.BuildingBlocks.SharedKernel.Time;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class MemberAiV28RegressionTests
{
    private static object InvokeInternal(string typeName, string methodName, string input)
    {
        var type = typeof(AiChatService).Assembly.GetType(
            "SportHub.AI.Application.Services." + typeName, throwOnError: true)!;
        var method = type.GetMethod(methodName, BindingFlags.NonPublic | BindingFlags.Static)!;
        return method.Invoke(null, new object[] { input })!;
    }

    [Theory]
    [InlineData("cho tôi thông tin các học sinh học cùng lớp")]
    [InlineData("ai là bạn cùng lớp tôi?")]
    [InlineData("Which students are in my class?")]
    [InlineData("Give me the class roster")]
    [InlineData("số điện thoại học viên khác")]
    public void Member_blocks_other_members_before_model(string question) =>
        Assert.True((bool)InvokeInternal("MemberVerifiedQueryV28", "IsOtherMemberRequest", question));

    [Theory]
    [InlineData("lịch học gần nhất khi nào?")]
    [InlineData("tôi đã được điểm danh chưa?")]
    [InlineData("plan nào khó tập nhất?")]
    [InlineData("what is my membership?")]
    public void Member_keeps_self_queries_accessible(string question) =>
        Assert.False((bool)InvokeInternal("MemberVerifiedQueryV28", "IsOtherMemberRequest", question));

    [Theory]
    [InlineData("tôi đã được điểm danh chưa?", "attendance")]
    [InlineData("lịch học gần nhất khi nào?", "classSchedule")]
    [InlineData("plan nào khó tập nhất?", "training")]
    public void Failed_planner_has_read_only_topic_fallback(string question, string topic)
    {
        var selected = (IReadOnlyList<string>)InvokeInternal(
            "MemberTopicFallbackV28", "Select", question);
        Assert.Contains(topic, selected);
        Assert.True(selected.Count <= 4);
    }

    [Fact]
    public void Shared_vietnam_time_matches_member_schedule_and_never_double_adds_hours()
    {
        var dbUtc = new DateTime(2026, 11, 6, 8, 0, 0, DateTimeKind.Utc);
        var local = VietnamTime.ToLocal(dbUtc);
        Assert.Equal(new DateTime(2026, 11, 6, 15, 0, 0), local);
        Assert.Equal(dbUtc, VietnamTime.ToUtc(local));
    }

    [Fact]
    public void Member_and_coach_have_distinct_AI_provider_types()
    {
        Assert.NotEqual(typeof(PythonAiChatProvider), typeof(PythonCoachChatProvider));
        Assert.NotEqual(typeof(PythonCoachChatProvider), typeof(PythonCoachPlanProvider));
    }
}

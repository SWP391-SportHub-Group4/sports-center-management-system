using SportHub.Scheduling.Domain.Constants;
using SportHub.Scheduling.Domain.Exceptions;
using SportHub.Scheduling.Domain.Rules;

namespace SportHub.Scheduling.Tests.Unit;

public sealed class ClassRulesTests
{
    [Theory]
    [InlineData(Disciplines.PersonalTraining, 1)]
    [InlineData(Disciplines.Yoga, 20)]
    [InlineData(Disciplines.GroupX, 30)]
    public void ValidateClass_accepts_the_three_official_disciplines(string discipline, int capacity)
        => ClassRules.ValidateClass(discipline, capacity);

    // "Gym" va "Boxing" la hai gia tri tung xuat hien trong comment/doc cu truoc khi chot
    // scope da bo mon — chot 18/09/2026 la ca hai deu bi tu choi (SSOT §1.1, §1.3).
    [Theory]
    [InlineData("Gym")]
    [InlineData("Boxing")]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("yoga")]
    [InlineData(null)]
    public void ValidateClass_rejects_everything_outside_the_three_disciplines(string? discipline)
    {
        var ex = Assert.Throws<InvalidDisciplineException>(() => ClassRules.ValidateClass(discipline, 10));

        Assert.Equal(discipline, ex.Discipline);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    [InlineData(20)]
    public void ValidateClass_rejects_personal_training_with_capacity_other_than_one(int capacity)
    {
        var ex = Assert.Throws<InvalidClassCapacityException>(
            () => ClassRules.ValidateClass(Disciplines.PersonalTraining, capacity));

        Assert.Equal(capacity, ex.Capacity);
    }

    // Cung rule ap cho capacity override o muc session: PT khong duoc nang suc chua qua 1
    // khi tao/sua/sinh ClassSession.
    [Fact]
    public void ValidateSessionCapacity_rejects_personal_training_override_above_one()
        => Assert.Throws<InvalidClassCapacityException>(
            () => ClassRules.ValidateSessionCapacity(Disciplines.PersonalTraining, 5));

    [Fact]
    public void ValidateSessionCapacity_leaves_group_disciplines_alone()
        => ClassRules.ValidateSessionCapacity(Disciplines.Yoga, 25);
}

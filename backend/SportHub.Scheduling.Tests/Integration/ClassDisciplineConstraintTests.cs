using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SportHub.API.Persistence;
using SportHub.Scheduling.Domain.Constants;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Domain.Enums;

namespace SportHub.Scheduling.Tests.Integration;

/// <summary>
/// Hai CHECK constraint bo mon tren bang classes — luoi an toan cuoi cung, doc lap voi
/// validation o ClassRules. Phai chay tren PostgreSQL that: CHECK khong ton tai o tang code.
/// </summary>
[Collection(nameof(SchedulingApiCollection))]
public sealed class ClassDisciplineConstraintTests(SchedulingApiFactory factory)
{
    [Theory]
    [InlineData(Disciplines.Yoga, 20)]
    [InlineData(Disciplines.GroupX, 30)]
    public async Task The_two_official_disciplines_are_accepted(string discipline, int capacity)
    {
        var classId = await InsertClassAsync(discipline, capacity);

        Assert.True(classId > 0);
    }

    // PersonalTraining doi 29/09/2026 (BE-4): khong con la Class discipline hop le — PT dung
    // PtEntitlement/PtSession rieng, khong con qua duoc CK_classes_discipline_allowed du capacity
    // dung 1. "Personal_training_with_capacity_other_than_one_is_rejected_by_the_database" (test
    // cu kiem CK_classes_personal_training_capacity rieng) bi xoa vi tien de khong con dung: PT
    // gio bi CK_classes_discipline_allowed chan truoc, khong the co truong hop "PT hop le discipline
    // nhung sai capacity" nua.
    [Theory]
    [InlineData(Disciplines.PersonalTraining)]
    [InlineData("Gym")]
    [InlineData("Boxing")]
    [InlineData("")]
    [InlineData("yoga")]
    public async Task Disciplines_outside_the_two_are_rejected_by_the_database(string discipline)
    {
        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => InsertClassAsync(discipline, 10));

        Assert.Equal("CK_classes_discipline_allowed", ConstraintNameOf(ex));
    }

    private static string? ConstraintNameOf(DbUpdateException ex)
        => (ex.InnerException as PostgresException)?.ConstraintName;

    private async Task<int> InsertClassAsync(string discipline, int capacity)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SportHubDbContext>();

        var room = new Room
        {
            Name = $"Room {Guid.NewGuid():N}",
            Capacity = 50
        };

        db.Rooms.Add(room);
        await db.SaveChangesAsync();

        var entity = new Class
        {
            Name = $"Class {Guid.NewGuid():N}",
            Discipline = discipline,
            DefaultRoomId = room.RoomId,
            Capacity = capacity,
            Status = ClassStatus.Active
        };

        db.Classes.Add(entity);
        await db.SaveChangesAsync();

        return entity.ClassId;
    }
}

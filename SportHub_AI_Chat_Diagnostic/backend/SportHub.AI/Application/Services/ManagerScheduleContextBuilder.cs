using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.AI.Application.DTOs.Manager;
using SportHub.AI.Application.Interfaces;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.Abstractions.Scheduling;
using SportHub.BuildingBlocks.SharedKernel.Time;
using SportHub.Identity.Domain.Entities;
using SportHub.Identity.Domain.Enums;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Occupancy.Domain;

namespace SportHub.AI.Application.Services;

public sealed class ManagerScheduleContextBuilder(
    ISportHubDbContext db)
    : IManagerScheduleContextBuilder
{
    public async Task<string> BuildAsync(
        Guid managerId,
        ManagerScheduleSuggestionRequest request,
        CancellationToken cancellationToken = default)
    {
        /*
         * ---------------------------------------------------
         * SPORT
         * ---------------------------------------------------
         */
        var sport = await db.Set<Sport>()
            .AsNoTracking()
            .Where(x =>
                x.SportId == request.SportId)
            .Select(x => new
            {
                x.SportId,
                x.Code,
                x.Name,
                x.Description,
                x.IsActive,

                GroupCourse = x.Services
                    .Where(service =>
                        service.ServiceType ==
                            SportServiceType.GroupCourse &&
                        service.IsEnabled)
                    .Select(service => new
                    {
                        service.DefaultSessionMinutes,
                        service.DefaultMaxCapacity
                    })
                    .FirstOrDefault()
            })
            .FirstOrDefaultAsync(
                cancellationToken);

        /*
         * ---------------------------------------------------
         * ROOM
         * ---------------------------------------------------
         */
        var room = await db.Set<Room>()
            .AsNoTracking()
            .Where(x =>
                x.RoomId ==
                    request.DefaultRoomId)
            .Select(x => new
            {
                x.RoomId,
                x.Name,
                x.Capacity,
                x.RoomTypeId,
                x.IsActive
            })
            .FirstOrDefaultAsync(
                cancellationToken);

        /*
         * ---------------------------------------------------
         * COACH
         * ---------------------------------------------------
         */
        object? coach = null;

        if (request.CoachId.HasValue)
        {
            var coachId =
                request.CoachId.Value;

            var coachAccount =
                await db.Set<UserAccount>()
                    .AsNoTracking()
                    .Where(x =>
                        x.UserId == coachId)
                    .Select(x => new
                    {
                        x.UserId,
                        x.Email,

                        FullName =
                            x.Profile != null
                                ? x.Profile.FullName
                                : x.Email,

                        Active =
                            x.Status ==
                                UserStatus.Active
                    })
                    .FirstOrDefaultAsync(
                        cancellationToken);

            var coachSportIds =
                await db.Set<UserSportSpecialty>()
                    .AsNoTracking()
                    .Where(x =>
                        x.UserId == coachId)
                    .Select(x =>
                        x.SportId)
                    .ToListAsync(
                        cancellationToken);

            if (coachAccount != null)
            {
                coach = new
                {
                    coachAccount.UserId,
                    coachAccount.Email,
                    coachAccount.FullName,
                    coachAccount.Active,

                    SportIds =
                        coachSportIds
                };
            }
        }

        /*
         * ---------------------------------------------------
         * PERSISTED ENTITY
         *
         * Load the actual database state when editing
         * an existing class.
         * ---------------------------------------------------
         */
        object? persistedEntity = null;

        if (request.ClassId.HasValue)
        {
            var classId =
                request.ClassId.Value;

            persistedEntity =
                await db.Set<Class>()
                    .AsNoTracking()
                    .Where(x =>
                        x.ClassId == classId)
                    .Select(x => new
                    {
                        x.ClassId,
                        x.Code,
                        x.Name,
                        x.SportId,
                        x.CoachId,
                        x.DefaultRoomId,
                        x.StartDate,
                        x.NumSessions,
                        x.Capacity,
                        x.Price,
                        x.CostAmount,
                        Status =
                            x.Status.ToString(),
                        x.Version,
                        x.CreatedByAi,

                        ScheduleRules =
                            x.ScheduleRules
                                .OrderBy(rule =>
                                    rule.RuleId)
                                .Select(rule => new
                                {
                                    rule.DayOfWeek,

                                    StartTimeLocal =
                                        rule.StartTimeLocal
                                            .ToString("HH:mm")
                                })
                                .ToList()
                    })
                    .FirstOrDefaultAsync(
                        cancellationToken);
        }

        /*
         * ---------------------------------------------------
         * PROPOSED ENTITY
         *
         * This is what the Manager currently has in the form.
         * It has NOT been saved.
         * ---------------------------------------------------
         */
        var proposedEntity = new
        {
            sportId =
                request.SportId,

            coachId =
                request.CoachId,

            defaultRoomId =
                request.DefaultRoomId,

            startDate =
                request.StartDate,

            numSessions =
                request.NumSessions,

            scheduleRules =
                request.ScheduleRules
        };

        /*
         * ---------------------------------------------------
         * AVAILABILITY WINDOW
         *
         * Give AI useful busy intervals around the current
         * proposed schedule.
         *
         * This is advisory context only.
         * Final slot validation still happens via
         * AvailabilityService / backend.
         * ---------------------------------------------------
         */

        var fromLocal =
            request.StartDate
                .ToDateTime(
                    TimeOnly.MinValue);

        /*
         * Maximum horizon:
         * roughly enough to cover up to 100 sessions
         * without querying an excessive time range.
         */
        var horizonDays =
            Math.Clamp(
                request.NumSessions * 7,
                14,
                365);

        var toLocal =
            fromLocal.AddDays(
                horizonDays);

        var fromUtc =
            VietnamTime.ToUtc(
                fromLocal);

        var toUtc =
            VietnamTime.ToUtc(
                toLocal);

        var roomBusy =
            await db.Set<RoomOccupancy>()
                .AsNoTracking()
                .Where(x =>
                    x.IsActive &&
                    x.RoomId ==
                        request.DefaultRoomId &&
                    x.StartAtUtc < toUtc &&
                    x.EndAtUtc > fromUtc)
                .OrderBy(x =>
                    x.StartAtUtc)
                .Select(x => new
                {
                    sourceType =
                        x.SourceType.ToString(),

                    x.SourceId,
                    x.StartAtUtc,
                    x.EndAtUtc
                })
                .Take(200)
                .ToListAsync(
                    cancellationToken);

        object coachBusy =
            Array.Empty<object>();

        if (request.CoachId.HasValue)
        {
            var coachId =
                request.CoachId.Value;

            var intervals =
                await db.Set<CoachOccupancy>()
                    .AsNoTracking()
                    .Where(x =>
                        x.IsActive &&
                        x.CoachId ==
                            coachId &&
                        x.StartAtUtc < toUtc &&
                        x.EndAtUtc > fromUtc)
                    .OrderBy(x =>
                        x.StartAtUtc)
                    .Select(x => new
                    {
                        sourceType =
                            x.SourceType.ToString(),

                        x.SourceId,
                        x.StartAtUtc,
                        x.EndAtUtc
                    })
                    .Take(200)
                    .ToListAsync(
                        cancellationToken);

            coachBusy =
                intervals;
        }

        var availabilityContext =
            new
            {
                verified =
                    false,

                authoritative =
                    false,

                finalBackendValidationRequired =
                    true,

                range = new
                {
                    fromUtc,
                    toUtc
                },

                selectedRoomBusyIntervals =
                    roomBusy,

                selectedCoachBusyIntervals =
                    coachBusy,

                note =
                    "Busy intervals are context only. " +
                    "Every AI-generated slot must be " +
                    "validated by SportHub backend availability."
            };

        /*
         * ---------------------------------------------------
         * FINAL AI CONTEXT
         * ---------------------------------------------------
         */
        var context = new
        {
            application =
                "SportHub",

            actor = new
            {
                role =
                    "CenterManager",

                userId =
                    managerId
            },

            currentOperation = new
            {
                operation =
                    request.Operation,

                page =
                    "MANAGER_CLASS_EDITOR",

                step =
                    "SCHEDULE"
            },

            entity = new
            {
                type =
                    "CLASS",

                id =
                    request.ClassId,

                version =
                    request.Version,

                state =
                    request.ClassId.HasValue
                        ? "EXISTING_ENTITY"
                        : "NEW_DRAFT"
            },

            permissions = new
            {
                editableFields =
                    new[]
                    {
                        "startDate",
                        "numSessions",
                        "scheduleRules"
                    },

                lockedFields =
                    new[]
                    {
                        "sportId",
                        "coachId",
                        "defaultRoomId",
                        "capacity",
                        "price",
                        "costAmount"
                    }
            },

            selectedEntities =
                new
                {
                    sport,
                    coach,
                    room
                },

            persistedEntity,

            proposedEntity,

            availabilityContext,

            schedulePolicy =
                new
                {
                    availabilityVerifiedByAi =
                        false,

                    backendValidationRequired =
                        true,

                    aiMayPublish =
                        false,

                    aiMaySave =
                        false,

                    aiMayChangeCoach =
                        false,

                    aiMayChangeRoom =
                        false,

                    aiMayChangeSport =
                        false
                }
        };

        return JsonSerializer.Serialize(
            context,
            new JsonSerializerOptions
            {
                PropertyNamingPolicy =
                    JsonNamingPolicy.CamelCase
            });
    }
}
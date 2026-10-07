using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.Identity.Domain.Entities;
using SportHub.Membership.Domain.Entities;
using SportHub.Payment.Domain.Entities;
using SportHub.Scheduling.Catalog.Domain;
using SportHub.Scheduling.Domain.Entities;
using SportHub.Scheduling.Rental.Domain;
using SportHub.Training.Domain.Entities;
using SportHub.Administration.Domain.Entities;

namespace SportHub.Administration.Application.Services;

/// <summary>Display-only current names, scoped to a filtered audit page. Never rewrite event snapshots.</summary>
internal static class AuditDisplayResolver
{
    private sealed record Named(string Entity, string Id, string Label);

    private static readonly Dictionary<string, string> References = new(StringComparer.OrdinalIgnoreCase)
    {
        ["sportId"] = "Sport", ["sportIds"] = "Sport", ["roomId"] = "Room",
        ["roomTypeId"] = "RoomType", ["roomTypeIds"] = "RoomType",
        ["offeringIds"] = "SportServiceOffering", ["classId"] = "Class", ["targetClassId"] = "Class",
        ["coachId"] = "UserAccount", ["currentCoachId"] = "UserAccount", ["requestedCoachId"] = "UserAccount",
        ["memberId"] = "UserAccount", ["ownerId"] = "UserAccount", ["ownerUserId"] = "UserAccount",
        ["invoiceId"] = "Invoice", ["invoiceItemId"] = "InvoiceItem", ["packageId"] = "MembershipPackage",
        ["entitlementId"] = "PtEntitlement", ["renewedMemberPackageId"] = "MemberPackage",
        ["makeupSessionId"] = "ClassSession", ["movedSessionIds"] = "PtSession", ["unmovedSessionIds"] = "PtSession", ["replacementSessionId"] = "PtSession"
    };

    internal static async Task<List<AuditLogResponse>> ResolveAsync(ISportHubDbContext db, List<AuditLogResponse> rows, CancellationToken ct)
    {
        var requests = rows.ToDictionary(r => r.AuditId, r =>
        {
            var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Key(TargetKind(r.TargetEntity), r.TargetId) };
            Read(r.OldValue, r.Action, keys);
            Read(r.NewValue, r.Action, keys);
            return keys;
        });
        var all = requests.Values.SelectMany(x => x).ToHashSet(StringComparer.OrdinalIgnoreCase);
        int[] Ints(string entity) => all.Where(k => k.StartsWith(entity + ":", StringComparison.OrdinalIgnoreCase))
            .Select(k => int.TryParse(k[(entity.Length + 1)..], out var id) ? id : 0).Where(id => id > 0).Distinct().ToArray();
        Guid[] Guids(string entity) => all.Where(k => k.StartsWith(entity + ":", StringComparison.OrdinalIgnoreCase))
            .Select(k => Guid.TryParse(k[(entity.Length + 1)..], out var id) ? id : Guid.Empty).Where(id => id != Guid.Empty).Distinct().ToArray();
        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        async Task Load(bool needed, IQueryable<Named> query)
        {
            if (!needed) return;
            foreach (var value in await query.ToListAsync(ct))
                if (!string.IsNullOrWhiteSpace(value.Label)) names[Key(value.Entity, value.Id)] = value.Label;
        }

        var ids = Ints("Sport");
        await Load(ids.Length > 0, db.Set<Sport>().AsNoTracking().Where(s => ids.Contains(s.SportId)).Select(s => new Named("Sport", s.SportId.ToString(), s.Name)));
        ids = Ints("Room");
        await Load(ids.Length > 0, db.Set<Room>().AsNoTracking().Where(s => ids.Contains(s.RoomId)).Select(s => new Named("Room", s.RoomId.ToString(), s.Name)));
        ids = Ints("RoomType");
        await Load(ids.Length > 0, db.Set<RoomType>().AsNoTracking().Where(s => ids.Contains(s.RoomTypeId)).Select(s => new Named("RoomType", s.RoomTypeId.ToString(), s.Name)));
        ids = Ints("MembershipPackage");
        await Load(ids.Length > 0, db.Set<MembershipPackage>().AsNoTracking().Where(s => ids.Contains(s.PackageId)).Select(s => new Named("MembershipPackage", s.PackageId.ToString(), s.Name)));
        ids = Ints("Class");
        await Load(ids.Length > 0, db.Set<Class>().AsNoTracking().Where(s => ids.Contains(s.ClassId)).Select(s => new Named("Class", s.ClassId.ToString(), s.Code + " · " + s.Name)));
        ids = Ints("SportServiceOffering");
        var offerings = ids.Length == 0 ? [] : await (from s in db.Set<SportServiceOffering>().AsNoTracking()
            join sport in db.Set<Sport>() on s.SportId equals sport.SportId
            where ids.Contains(s.OfferingId) select new { s.OfferingId, sport.Name, s.ServiceType }).ToListAsync(ct);
        foreach (var s in offerings) names[Key("SportServiceOffering", s.OfferingId.ToString())] = s.Name + " · " + s.ServiceType;
        ids = Ints("CourtRate");
        await Load(ids.Length > 0, from s in db.Set<CourtRate>().AsNoTracking() join type in db.Set<RoomType>() on s.RoomTypeId equals type.RoomTypeId
            where ids.Contains(s.RateId) select new Named("CourtRate", s.RateId.ToString(), type.Name));
        var gids = Guids("UserAccount");
        await Load(gids.Length > 0, db.Set<UserAccount>().AsNoTracking().Where(s => gids.Contains(s.UserId))
            .Select(s => new Named("UserAccount", s.UserId.ToString(), s.Profile != null && s.Profile.FullName != "" ? s.Profile.FullName : s.Email)));
        gids = Guids("ClassSession");
        await Load(gids.Length > 0, db.Set<ClassSession>().AsNoTracking().Where(s => gids.Contains(s.SessionId))
            .Select(s => new Named("ClassSession", s.SessionId.ToString(), s.Class!.Code + " · " + s.Class.Name + " · #" + s.SessionNo)));
        gids = Guids("RoomBlock");
        await Load(gids.Length > 0, from s in db.Set<RoomBlock>().AsNoTracking() join room in db.Set<Room>() on s.RoomId equals room.RoomId
            where gids.Contains(s.BlockId) select new Named("RoomBlock", s.BlockId.ToString(), room.Name));
        gids = Guids("IncidentNotice");
        await Load(gids.Length > 0, from s in db.Set<IncidentNotice>().AsNoTracking() join room in db.Set<Room>() on s.RoomId equals room.RoomId into rooms
            from room in rooms.DefaultIfEmpty() where gids.Contains(s.IncidentId)
            select new Named("IncidentNotice", s.IncidentId.ToString(), room != null ? room.Name : "Center"));
        gids = Guids("Invoice");
        var rentalIds = Guids("CourtRental");
        await Load(rentalIds.Length > 0, from s in db.Set<CourtRental>().AsNoTracking() join room in db.Set<Room>() on s.RoomId equals room.RoomId
            where rentalIds.Contains(s.CourtRentalId) select new Named("CourtRental", s.CourtRentalId.ToString(), room.Name));
        await Load(gids.Length > 0, db.Set<Invoice>().AsNoTracking().Where(s => gids.Contains(s.InvoiceId)).Select(s => new Named("Invoice", s.InvoiceId.ToString(), s.InvoiceNumber)));
        gids = Guids("InvoiceItem");
        await Load(gids.Length > 0, db.Set<InvoiceItem>().AsNoTracking().Where(s => gids.Contains(s.ItemId)).Select(s => new Named("InvoiceItem", s.ItemId.ToString(), s.Invoice!.InvoiceNumber + " · " + s.Description)));
        gids = Guids("PaymentAdjustment");
        await Load(gids.Length > 0, db.Set<PaymentAdjustment>().AsNoTracking().Where(s => gids.Contains(s.AdjustmentId))
            .Select(s => new Named("PaymentAdjustment", s.AdjustmentId.ToString(), s.Invoice!.InvoiceNumber + (s.InvoiceItem != null ? " · " + s.InvoiceItem.Description : ""))));
        gids = Guids("MemberPackage");
        await Load(gids.Length > 0, db.Set<MemberPackage>().AsNoTracking().Where(s => gids.Contains(s.MemberPackageId))
            .Select(s => new Named("MemberPackage", s.MemberPackageId.ToString(), s.Package!.Name + " · " + (s.Member!.Profile != null ? s.Member.Profile.FullName : s.Member.Email))));
        gids = Guids("PtEntitlement");
        await Load(gids.Length > 0, db.Set<PtEntitlement>().AsNoTracking().Where(s => gids.Contains(s.EntitlementId))
            .Select(s => new Named("PtEntitlement", s.EntitlementId.ToString(), (s.Member!.Profile != null ? s.Member.Profile.FullName : s.Member.Email) + " · " + (s.Coach!.Profile != null ? s.Coach.Profile.FullName : s.Coach.Email))));
        gids = Guids("PtSession");
        await Load(gids.Length > 0, db.Set<PtSession>().AsNoTracking().Where(s => gids.Contains(s.SessionId))
            .Select(s => new Named("PtSession", s.SessionId.ToString(), (s.Member!.Profile != null ? s.Member.Profile.FullName : s.Member.Email) + " · " + (s.Coach!.Profile != null ? s.Coach.Profile.FullName : s.Coach.Email))));
        gids = Guids("PtCoachChangeRequest");
        await Load(gids.Length > 0, db.Set<PtCoachChangeRequest>().AsNoTracking().Where(s => gids.Contains(s.RequestId))
            .Select(s => new Named("PtCoachChangeRequest", s.RequestId.ToString(), s.Member!.Profile != null ? s.Member.Profile.FullName : s.Member.Email)));
        gids = Guids("PtSessionChangeRequest");
        await Load(gids.Length > 0, db.Set<PtSessionChangeRequest>().AsNoTracking().Where(s => gids.Contains(s.RequestId))
            .Select(s => new Named("PtSessionChangeRequest", s.RequestId.ToString(), s.RequestedByUser!.Profile != null ? s.RequestedByUser.Profile.FullName : s.RequestedByUser.Email)));
        gids = Guids("CoachMemberRelationship");
        await Load(gids.Length > 0, db.Set<CoachMemberRelationship>().AsNoTracking().Where(s => gids.Contains(s.RelationshipId))
            .Select(s => new Named("CoachMemberRelationship", s.RelationshipId.ToString(), (s.Coach!.Profile != null ? s.Coach.Profile.FullName : s.Coach.Email) + " · " + (s.Member!.Profile != null ? s.Member.Profile.FullName : s.Member.Email))));
        gids = Guids("ReportExport");
        await Load(gids.Length > 0, db.Set<ReportExport>().AsNoTracking().Where(s => gids.Contains(s.ReportExportId))
            .Select(s => new Named("ReportExport", s.ReportExportId.ToString(), s.ReportType + " · " + s.Format)));

        return rows.Select(row => row with
        {
            CurrentTargetLabel = names.GetValueOrDefault(Key(TargetKind(row.TargetEntity), row.TargetId)),
            ReferenceNames = requests[row.AuditId].Where(names.ContainsKey).ToDictionary(k => k, k => names[k])
        }).ToList();
    }

    private static string TargetKind(string entity) => entity is "PointWallet" or "CoachServiceQualification" ? "UserAccount" : entity;
    private static string Key(string entity, string id) => entity + ":" + (Guid.TryParse(id, out var guid) ? guid.ToString() : int.TryParse(id, out var number) ? number.ToString() : id);
    private static void Read(string? raw, string action, HashSet<string> keys)
    {
        if (raw is null) return;
        try
        {
            using var json = JsonDocument.Parse(raw);
            var data = json.RootElement;
            if (data.ValueKind == JsonValueKind.Object && data.TryGetProperty("value", out var value)) data = value;
            if (data.ValueKind == JsonValueKind.Array && action == "SET_ROOM_TYPE_SPORTS") Add("Sport", data);
            else if (data.ValueKind == JsonValueKind.Object)
                foreach (var property in data.EnumerateObject())
                {
                    if (References.TryGetValue(property.Name, out var kind)) Add(kind, property.Value);
                    else if (property.Name.Equals("sessionId", StringComparison.OrdinalIgnoreCase))
                        Add(action.Contains("COURSE_ATTENDANCE") ? "ClassSession" : "PtSession", property.Value);
                    else if (property.Name.Equals("affectedSources", StringComparison.OrdinalIgnoreCase) && property.Value.ValueKind == JsonValueKind.Array)
                        foreach (var source in property.Value.EnumerateArray())
                        {
                            if (source.ValueKind != JsonValueKind.Object) continue;
                            var fields = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
                            foreach (var field in source.EnumerateObject()) fields[field.Name] = field.Value;
                            if (fields.TryGetValue("sourceType", out var type) && type.ValueKind == JsonValueKind.String
                                && type.GetString() is "ClassSession" or "PtSession" or "CourtRental" or "RoomBlock"
                                && fields.TryGetValue("sourceId", out var id)) Add(type.GetString()!, id);
                        }
                }
        }
        catch (JsonException) { /* Legacy malformed payloads retain their ID fallback. */ }

        void Add(string kind, JsonElement value)
        {
            if (value.ValueKind == JsonValueKind.Array) { foreach (var item in value.EnumerateArray()) Add(kind, item); }
            else if (value.ValueKind is JsonValueKind.String or JsonValueKind.Number) keys.Add(Key(kind, value.ToString()));
        }
    }
}

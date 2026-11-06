using System;
using System.Linq;

namespace SportHub.AI.Application.Services;

// Generated from explicitly Member-authorized or public GET controller declarations.
// This is documentation, NOT an API client or an authorization grant.
internal static class AiMemberApiKnowledge
{
    private sealed record Endpoint(string Topic, string Method, string Route);
    private static readonly Endpoint[] Verified =
    {
        new("classes", "GET", "/api/classes"),
        new("classes", "GET", "/api/classes/{classId:int}"),
        new("classes", "GET", "/api/classes/{classId:int}/public-sessions"),
        new("classes", "GET", "/api/members/me/class-holds"),
        new("classes", "GET", "/api/members/me/classes/{classId:int}/sessions"),
        new("classes", "GET", "/api/members/me/enrollments"),
        new("payments", "GET", "/api/members/me/invoices"),
        new("payments", "GET", "/api/members/me/packages"),
        new("classes", "GET", "/api/members/me/schedule"),
        new("profile", "GET", "/api/members/me/training-profile"),
        new("payments", "GET", "/api/members/me/unactivated-payments"),
        new("services", "GET", "/api/public/sports-gallery"),
        new("services", "GET", "/api/sports"),
        new("payments", "GET", "/api/wallet/me"),
        new("payments", "GET", "/api/wallet/me/ledger"),
    };

    public static object ForQuestion(string? question)
    {
        var q = (question ?? string.Empty).ToLowerInvariant();
        var topic = q.Contains("lớp") || q.Contains("lịch") || q.Contains("buổi") || q.Contains("enroll") || q.Contains("schedule") || q.Contains("class") ? "classes"
            : q.Contains("gói") || q.Contains("điểm") || q.Contains("payment") || q.Contains("membership") || q.Contains("invoice") || q.Contains("wallet") || q.Contains("thanh toán") ? "payments"
            : q.Contains("môn") || q.Contains("sân") || q.Contains("sport") || q.Contains("court") || q.Contains("dịch vụ") || q.Contains("gym") ? "services"
            : q.Contains("hồ sơ") || q.Contains("thông báo") || q.Contains("support") || q.Contains("request") || q.Contains("profile") || q.Contains("avatar") ? "profile"
            : "overview";
        return new
        {
            source = "Audited controller GET declarations (not live API responses)",
            topic,
            endpoints = Verified.Where(e => topic == "overview" ? e.Topic != "other" : e.Topic == topic).Take(30).Select(e => new { method = e.Method, path = e.Route }).ToArray(),
            note = "Only describe these as endpoint references. Never claim that an endpoint was invoked or that a record exists without a successful authorized data query. No write API execution available."
        };
    }
}

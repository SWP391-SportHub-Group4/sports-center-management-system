using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SportHub.Training.Tests.Integration;

/// <summary>
/// Đọc response theo đúng hợp đồng wire của API: enum là chuỗi (JsonStringEnumConverter ở Program.cs) và tên thuộc tính camelCase.
/// ReadFromJsonAsync mặc định không có converter chuỗi cho enum nên không parse được DTO có enum.
/// </summary>
internal static class ApiJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    public static Task<T?> ReadApiJsonAsync<T>(this HttpContent content, CancellationToken ct = default)
        => content.ReadFromJsonAsync<T>(Options, ct);
}

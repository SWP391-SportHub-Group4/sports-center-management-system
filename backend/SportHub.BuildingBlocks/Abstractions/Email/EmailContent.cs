using System.Net;
using System.Text;

namespace SportHub.BuildingBlocks.Abstractions.Email;

/// <summary>Escaped, email-client-friendly fragments for transactional messages.</summary>
public static class EmailContent
{
    public static string Text(string? value) => WebUtility.HtmlEncode(value ?? string.Empty)
        .Replace("\r\n", "\n").Replace("\r", "\n").Replace("\n", "<br>");

    public static string Paragraph(string text) => $"<p style=\"margin:0 0 20px;\">{Text(text)}</p>";

    public static string Details(params (string Label, string Value)[] fields)
    {
        var html = new StringBuilder("<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;table-layout:fixed;margin:0 0 24px;\"><tbody>");
        foreach (var (label, value) in fields)
            html.Append($"<tr><th scope=\"row\" width=\"28%\" valign=\"top\" style=\"padding:12px 12px 12px 0;border-bottom:1px solid #dce2d7;text-align:left;font-weight:400;color:#52645a;\">{Text(label)}</th><td valign=\"top\" style=\"padding:12px 0;border-bottom:1px solid #dce2d7;overflow-wrap:anywhere;word-break:break-word;\">{Text(value)}</td></tr>");
        return html.Append("</tbody></table>").ToString();
    }

    public static string Changes(params (string Label, string Before, string After)[] fields)
    {
        var html = new StringBuilder();
        foreach (var (label, before, after) in fields.Where(f => f.Before != f.After))
            html.Append(Change(label, before, after));
        return html.ToString();
    }

    public static string Change(string label, string before, string after)
        => $"<div style=\"padding:14px 16px;margin:0 0 12px;background:#f2f4ed;border-radius:8px;overflow-wrap:anywhere;word-break:break-word;\"><strong>{Text(label)}</strong><p style=\"margin:6px 0 2px;color:#000000;font-weight:400;\"><strong>Previously:</strong> {Text(before)}</p><p style=\"margin:0;color:#000000;font-weight:400;\"><strong>Now:</strong> {Text(after)}</p></div>";
}

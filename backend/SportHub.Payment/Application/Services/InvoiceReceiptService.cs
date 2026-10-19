using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Interfaces;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Application.Services;

public sealed class InvoiceReceiptService(
    ISportHubDbContext db,
    IConfiguration configuration)
    : IInvoiceReceiptService
{
    static InvoiceReceiptService()
    {
        QuestPDF.Settings.License =
            LicenseType.Community;
    }

    public async Task<InvoiceReceiptModel>
        BuildAsync(
            Guid invoiceId,
            CancellationToken ct = default)
    {
        var invoice =
            await db.Set<Invoice>()
                .AsNoTracking()
                .Include(x => x.Member)
                    .ThenInclude(x => x!.Profile)
                .SingleOrDefaultAsync(
                    x =>
                        x.InvoiceId ==
                        invoiceId,
                    ct)
            ?? throw new NotFoundException(
                "invoice_not_found",
                "Invoice not found.");

        var issuer =
            await db
                .Set<
                    SportHub.Identity.Domain.Entities
                        .UserAccount>()
                .AsNoTracking()
                .Include(x => x.Profile)
                .SingleOrDefaultAsync(
                    x =>
                        x.UserId ==
                        invoice.IssuedByUserId,
                    ct);

        var items =
            await db.Set<InvoiceItem>()
                .AsNoTracking()
                .Where(
                    x =>
                        x.InvoiceId ==
                        invoiceId)
                .OrderBy(x => x.ItemId)
                .Select(
                    x =>
                        new InvoiceReceiptItem(
                            x.Description,
                            x.UnitPrice,
                            x.Quantity,
                            x.LineAmount))
                .ToListAsync(ct);

        var successfulPayments =
            await db
                .Set<Domain.Entities.Payment>()
                .AsNoTracking()
                .Where(
                    x =>
                        x.InvoiceId ==
                            invoiceId &&
                        x.Status ==
                            PaymentStatus.Success)
                .OrderBy(x => x.PaidAt)
                .ToListAsync(ct);

        var reference = string.Join(", ", successfulPayments
            .Select(x => x.ReferenceCode)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct());

        var hasStaffPayment = successfulPayments.Any(x =>
            x.ReceivedByUserId != invoice.MemberId &&
            x.Method.ToString().Equals("Cash", StringComparison.OrdinalIgnoreCase));

        var paymentMethod =
            successfulPayments.Count == 0
                ? invoice.PaidVia ??
                  "N/A"
                : string.Join(
                    ", ",
                    successfulPayments
                        .Select(
                            x =>
                                x.Method.ToString())
                        .Distinct());

        var obligationReduction = await db.Set<PaymentAdjustment>()
            .AsNoTracking()
            .Where(x => x.InvoiceId == invoiceId &&
                x.Status == PaymentAdjustmentStatus.Completed &&
                x.Type != PaymentAdjustmentType.Refund)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var refundedAmount = await db.Set<PaymentAdjustment>()
            .AsNoTracking()
            .Where(x => x.InvoiceId == invoiceId &&
                x.Status == PaymentAdjustmentStatus.Completed &&
                x.Type == PaymentAdjustmentType.Refund)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0m;

        var refundedPoints =
            await db
                .Set<PaymentAdjustment>()
                .AsNoTracking()
                .Where(
                    x =>
                        x.InvoiceId ==
                            invoiceId &&
                        x.Type ==
                            PaymentAdjustmentType.Refund &&
                        x.Status ==
                            PaymentAdjustmentStatus.Completed)
                .SumAsync(
                    x =>
                        (int?)x.ApprovedPoints,
                    ct)
            ?? 0;

        var pointsApplied =
            invoice.Status ==
                    InvoiceStatus.Paid &&
                invoice.CheckoutCycleId != null
                ? invoice.PointsApplied
                : invoice.Status ==
                    InvoiceStatus.PaidAfterReconciliation
                    ? invoice.PointsApplied
                    : 0;

        const decimal vndPerPoint =
            1000m;

        var balance = new InvoiceBalance(
            invoice.TotalAmount,
            successfulPayments.Sum(x => x.Amount) + pointsApplied * vndPerPoint,
            obligationReduction,
            refundedAmount);

        return new InvoiceReceiptModel(
            invoice.InvoiceId,
            invoice.InvoiceNumber,
            invoice.IssuedAt,
            invoice.PaidAtUtc,

            issuer?.Profile?.FullName ??
            issuer?.Email ??
            "SportHub",

            invoice.Member?.Profile?.FullName ??
            invoice.Member?.Email ??
            string.Empty,

            invoice.Member?.Email ??
            string.Empty,

            invoice.Member?.Profile?.Phone,

            items,

            invoice.TotalAmount,
            pointsApplied,
            pointsApplied * vndPerPoint,
            invoice.CashAmount,

            (invoice.PaidVia?.Contains("vnpay", StringComparison.OrdinalIgnoreCase) == true)
                ? "VNPay" : paymentMethod,
            invoice.Status.ToString(),

            refundedPoints,
            string.IsNullOrWhiteSpace(reference) ? null : reference,
            configuration["PublicContact:Phone"],
            configuration["PublicContact:Email"],
            configuration["PublicContact:Address"],
            invoice.Status == InvoiceStatus.Issued ? balance.Outstanding : 0m,
            hasStaffPayment);
    }

    private static bool IsPaid(InvoiceReceiptModel m) =>
        m.PaymentStatus.Equals("Paid", StringComparison.OrdinalIgnoreCase) ||
        m.PaymentStatus.Equals("PaidAfterReconciliation", StringComparison.OrdinalIgnoreCase);

    private static bool IsVoid(InvoiceReceiptModel m) =>
        m.PaymentStatus.Equals("Void", StringComparison.OrdinalIgnoreCase);

    private static string ReceiptTitle(InvoiceReceiptModel m) =>
        IsVoid(m) ? "HÓA ĐƠN ĐÃ HỦY" : IsPaid(m) ? "BIÊN LAI THANH TOÁN" : "HÓA ĐƠN – CHỜ THANH TOÁN";

    private static string ReceiptBadge(InvoiceReceiptModel m) =>
        IsVoid(m) ? "VOID" : IsPaid(m) ? "PAID" : "ISSUED";

    private static string FriendlyMethod(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value == "N/A") return "Not recorded";
        return string.Join(", ", value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.ToLowerInvariant() switch
            {
                "vnpay" => "VNPay", "cash" => "Cash", "ewallet" => "E-wallet",
                "card" => "Card", "transfer" => "Bank transfer", _ => x
            }));
    }

    public byte[] RenderPdf(InvoiceReceiptModel model)
    {
        var paid = IsPaid(model);
        var issued = !paid && !IsVoid(model);
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(35);
                page.DefaultTextStyle(t => t.FontSize(10).FontColor(Colors.Grey.Darken4));
                page.Header().Column(header =>
                {
                    header.Item().Row(row =>
                    {
                        row.RelativeItem().Column(left =>
                        {
                            left.Item().Text("SPORTHUB").Bold().FontSize(23).FontColor(Colors.Teal.Darken3);
                            if (!string.IsNullOrWhiteSpace(model.CenterAddress)) left.Item().Text(model.CenterAddress).FontSize(9);
                            if (!string.IsNullOrWhiteSpace(model.CenterPhone)) left.Item().Text($"Phone: {model.CenterPhone}").FontSize(9);
                            if (!string.IsNullOrWhiteSpace(model.CenterEmail)) left.Item().Text($"Email: {model.CenterEmail}").FontSize(9);
                        });
                        row.ConstantItem(210).AlignRight().Column(right =>
                        {
                            right.Item().AlignRight().Text(ReceiptBadge(model)).Bold().FontSize(13)
                                .FontColor(IsVoid(model) ? Colors.Red.Darken2 : paid ? Colors.Green.Darken2 : Colors.Orange.Darken3);
                            right.Item().AlignRight().Text(ReceiptTitle(model)).Bold().FontSize(12);
                            right.Item().AlignRight().Text(model.InvoiceNumber).FontSize(10);
                        });
                    });
                    header.Item().PaddingTop(10).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                });
                page.Content().PaddingTop(18).Column(col =>
                {
                    col.Spacing(14);
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("MEMBER").Bold().FontColor(Colors.Teal.Darken3);
                            c.Item().Text(model.MemberName);
                            if (!string.IsNullOrWhiteSpace(model.MemberEmail)) c.Item().Text(model.MemberEmail);
                            if (!string.IsNullOrWhiteSpace(model.MemberPhone)) c.Item().Text(model.MemberPhone);
                        });
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("INVOICE DETAILS").Bold().FontColor(Colors.Teal.Darken3);
                            c.Item().Text($"Invoice: {model.InvoiceNumber}");
                            c.Item().Text($"Issued: {FormatDate(model.IssuedAt)}");
                            if (paid && model.PaidAtUtc.HasValue) c.Item().Text($"Paid: {FormatDate(model.PaidAtUtc.Value)}");
                            if (model.ShowCashier) c.Item().Text($"Processed by: {model.CashierName}");
                        });
                    });
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c => { c.RelativeColumn(5); c.ConstantColumn(38); c.RelativeColumn(2); c.RelativeColumn(2); });
                        table.Header(h =>
                        {
                            static IContainer Cell(IContainer c) => c.Background(Colors.Grey.Lighten3).BorderBottom(1).BorderColor(Colors.Grey.Lighten1).Padding(7);
                            h.Cell().Element(Cell).Text("Service / item").Bold();
                            h.Cell().Element(Cell).AlignRight().Text("Qty").Bold();
                            h.Cell().Element(Cell).AlignRight().Text("Unit price").Bold();
                            h.Cell().Element(Cell).AlignRight().Text("Amount").Bold();
                        });
                        foreach (var item in model.Items)
                        {
                            static IContainer Cell(IContainer c) => c.BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).PaddingVertical(8).PaddingHorizontal(7);
                            table.Cell().Element(Cell).Text(item.Description);
                            table.Cell().Element(Cell).AlignRight().Text(item.Quantity.ToString());
                            table.Cell().Element(Cell).AlignRight().Text(Money(item.UnitPrice));
                            table.Cell().Element(Cell).AlignRight().Text(Money(item.LineAmount));
                        }
                    });
                    col.Item().AlignRight().Width(285).Column(total =>
                    {
                        total.Spacing(5);
                        void Line(string label, string value, bool strong = false)
                        {
                            total.Item().Row(r =>
                            {
                                r.RelativeItem().Text(label);
                                r.ConstantItem(125).AlignRight().Text(t => { if (strong) t.Span(value).Bold(); else t.Span(value); });
                            });
                        }
                        Line("Subtotal", Money(model.TotalAmount));
                        if (!IsVoid(model))
                        {
                            Line("Points applied", $"{model.PointsApplied:N0} ({Money(model.PointsValue)})");
                            Line("Cash payable", Money(model.CashAmount));
                            if (issued) Line("Amount outstanding", Money(model.Outstanding), true);
                            if (paid) Line("Payment method", FriendlyMethod(model.PaymentMethod));
                            if (paid && !string.IsNullOrWhiteSpace(model.TransactionReference))
                                Line("Transaction reference", model.TransactionReference);
                            if (model.RefundedPoints > 0) Line("Points refunded", model.RefundedPoints.ToString("N0"));
                        }
                        else Line("Payment", "Canceled");
                        total.Item().PaddingTop(4).LineHorizontal(1).LineColor(Colors.Grey.Lighten1);
                        Line("Status", ReceiptBadge(model), true);
                    });
                });
                page.Footer().AlignCenter().Text(t =>
                {
                    t.Span("SportHub");
                    if (!string.IsNullOrWhiteSpace(model.CenterPhone)) t.Span($"  •  {model.CenterPhone}");
                    if (!string.IsNullOrWhiteSpace(model.CenterEmail)) t.Span($"  •  {model.CenterEmail}");
                });
            });
        });
        return document.GeneratePdf();
    }

    public string RenderHtml(InvoiceReceiptModel model)
    {
        static string E(string? v) => WebUtility.HtmlEncode(v ?? "");
        var rows = string.Join("", model.Items.Select(x =>
            $"<tr><td>{E(x.Description)}</td><td class='number'>{x.Quantity}</td><td class='number'>{Money(x.UnitPrice)}</td><td class='number'>{Money(x.LineAmount)}</td></tr>"));
        var paid = IsPaid(model);
        var contact = string.Join(" · ", new[] { model.CenterAddress, model.CenterPhone, model.CenterEmail }
            .Where(x => !string.IsNullOrWhiteSpace(x)).Select(E));
        var fields = $"<p><b>Issued:</b> {FormatDate(model.IssuedAt)}</p>" +
            (paid && model.PaidAtUtc.HasValue ? $"<p><b>Paid:</b> {FormatDate(model.PaidAtUtc.Value)}</p>" : "") +
            (model.ShowCashier ? $"<p><b>Processed by:</b> {E(model.CashierName)}</p>" : "");
        var settlement = IsVoid(model) ? "<p><b>Payment:</b> Canceled</p>" :
            $"<p><b>Points applied:</b> {model.PointsApplied:N0} ({Money(model.PointsValue)})</p>" +
            $"<p><b>Cash payable:</b> {Money(model.CashAmount)}</p>" +
            (!paid ? $"<p><b>Amount outstanding:</b> {Money(model.Outstanding)}</p>" :
                $"<p><b>Payment method:</b> {E(FriendlyMethod(model.PaymentMethod))}</p>" +
                (string.IsNullOrWhiteSpace(model.TransactionReference) ? "" : $"<p><b>Transaction reference:</b> {E(model.TransactionReference)}</p>")) +
            (model.RefundedPoints > 0 ? $"<p><b>Points refunded:</b> {model.RefundedPoints:N0}</p>" : "");
        return $$"""
            <!doctype html><html><head><meta charset="utf-8"><style>
            body{font:14px Arial,sans-serif;background:#f4f7f6;padding:24px;color:#172b28}
            .receipt{max-width:760px;margin:auto;background:white;border:1px solid #d8e2dd;border-radius:10px;padding:26px}
            .heading{display:flex;justify-content:space-between;gap:25px;border-bottom:2px solid #1d6d61;padding-bottom:14px}
            .heading h1{margin:0;color:#1d6d61}.status{font-weight:bold;text-align:right}
            .meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}
            table{border-collapse:collapse;width:100%} th,td{padding:9px;border-bottom:1px solid #ddd;text-align:left}
            th{background:#eaf2ef}.number{text-align:right}.totals{margin:18px 0 0 auto;max-width:320px}
            .totals p{display:flex;justify-content:space-between;gap:15px}
            footer{border-top:1px solid #ddd;margin-top:25px;padding-top:12px;color:#52615c;font-size:12px}
            </style></head><body><div class="receipt">
            <div class="heading"><div><h1>SPORTHUB</h1><div>{{contact}}</div></div>
            <div class="status">{{E(ReceiptTitle(model))}}<p>{{E(ReceiptBadge(model))}}</p><div>{{E(model.InvoiceNumber)}}</div></div></div>
            <div class="meta"><div><h3>Member</h3><p>{{E(model.MemberName)}}</p><p>{{E(model.MemberEmail)}}</p><p>{{E(model.MemberPhone)}}</p></div>
            <div><h3>Invoice details</h3><p><b>Invoice:</b> {{E(model.InvoiceNumber)}}</p>{{fields}}</div></div>
            <table><thead><tr><th>Service / item</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Amount</th></tr></thead>
            <tbody>{{rows}}</tbody></table>
            <div class="totals"><p><b>Subtotal:</b><b>{{Money(model.TotalAmount)}}</b></p>{{settlement}}<p><b>Status:</b><b>{{E(ReceiptBadge(model))}}</b></p></div>
            <footer>SportHub{{(contact.Length > 0 ? " · " + contact : "")}}</footer></div></body></html>
            """;
    }

    private static string Money(
        decimal value)
        =>
            $"{value:N0} VND";

    private static string FormatDate(
        DateTime utc)
    {
        var vietnam =
            TimeZoneInfo.FindSystemTimeZoneById(
                OperatingSystem.IsWindows()
                    ? "SE Asia Standard Time"
                    : "Asia/Ho_Chi_Minh");

        var value =
            utc.Kind ==
                DateTimeKind.Utc
                ? utc
                : DateTime.SpecifyKind(
                    utc,
                    DateTimeKind.Utc);

        return TimeZoneInfo
            .ConvertTimeFromUtc(
                value,
                vietnam)
            .ToString(
                "dd/MM/yyyy HH:mm");
    }
}
using System.Net;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SportHub.BuildingBlocks.Abstractions.Persistence;
using SportHub.BuildingBlocks.SharedKernel.Errors;
using SportHub.Payment.Application.Interfaces;

namespace SportHub.Payment.Application.Services;

public sealed class InvoiceReceiptService(
    ISportHubDbContext db)
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

            paymentMethod,
            invoice.Status.ToString(),

            refundedPoints);
    }

    public byte[] RenderPdf(
        InvoiceReceiptModel model)
    {
        var document =
            Document.Create(
                container =>
                {
                    container.Page(
                        page =>
                        {
                            page.Size(
                                PageSizes.A4);

                            page.Margin(32);

                            page.DefaultTextStyle(
                                x =>
                                    x.FontSize(10));

                            page.Header()
                                .Column(
                                    column =>
                                    {
                                        column.Item()
                                            .Text("SPORTHUB")
                                            .Bold()
                                            .FontSize(22);

                                        column.Item()
                                            .Text(
                                                "PAYMENT RECEIPT")
                                            .Bold()
                                            .FontSize(16);

                                        column.Item()
                                            .Text(
                                                $"Invoice: {model.InvoiceNumber}");
                                    });

                            page.Content()
                                .PaddingVertical(20)
                                .Column(
                                    column =>
                                    {
                                        column.Spacing(10);

                                        column.Item()
                                            .Text(
                                                $"Issued: {FormatDate(model.IssuedAt)}");

                                        column.Item()
                                            .Text(
                                                $"Cashier: {model.CashierName}");

                                        if (
                                            model.PaidAtUtc
                                            is not null)
                                        {
                                            column.Item()
                                                .Text(
                                                    $"Paid: {FormatDate(model.PaidAtUtc.Value)}");
                                        }

                                        column.Item()
                                            .PaddingTop(8)
                                            .Text("MEMBER")
                                            .Bold();

                                        column.Item()
                                            .Text(
                                                $"Name: {model.MemberName}");

                                        column.Item()
                                            .Text(
                                                $"Email: {model.MemberEmail}");

                                        column.Item()
                                            .Text(
                                                $"Phone: {model.MemberPhone ?? "-"}");

                                        column.Item()
                                            .PaddingTop(12)
                                            .Table(
                                                table =>
                                                {
                                                    table
                                                        .ColumnsDefinition(
                                                            columns =>
                                                            {
                                                                columns
                                                                    .RelativeColumn(4);

                                                                columns
                                                                    .ConstantColumn(45);

                                                                columns
                                                                    .RelativeColumn(2);

                                                                columns
                                                                    .RelativeColumn(2);
                                                            });

                                                    table.Header(
                                                        header =>
                                                        {
                                                            header.Cell()
                                                                .Text("Item")
                                                                .Bold();

                                                            header.Cell()
                                                                .AlignRight()
                                                                .Text("Qty")
                                                                .Bold();

                                                            header.Cell()
                                                                .AlignRight()
                                                                .Text("Price")
                                                                .Bold();

                                                            header.Cell()
                                                                .AlignRight()
                                                                .Text("Amount")
                                                                .Bold();
                                                        });

                                                    foreach (
                                                        var item
                                                        in model.Items)
                                                    {
                                                        table.Cell()
                                                            .PaddingVertical(4)
                                                            .Text(
                                                                item.Description);

                                                        table.Cell()
                                                            .PaddingVertical(4)
                                                            .AlignRight()
                                                            .Text(
                                                                item.Quantity
                                                                    .ToString());

                                                        table.Cell()
                                                            .PaddingVertical(4)
                                                            .AlignRight()
                                                            .Text(
                                                                Money(
                                                                    item.UnitPrice));

                                                        table.Cell()
                                                            .PaddingVertical(4)
                                                            .AlignRight()
                                                            .Text(
                                                                Money(
                                                                    item.LineAmount));
                                                    }
                                                });

                                        column.Item()
                                            .PaddingTop(16)
                                            .AlignRight()
                                            .Column(
                                                totals =>
                                                {
                                                    totals.Item()
                                                        .Text(
                                                            $"Total: {Money(model.TotalAmount)}");

                                                    totals.Item()
                                                        .Text(
                                                            $"Points: {model.PointsApplied:N0} points = {Money(model.PointsValue)}");

                                                    totals.Item()
                                                        .Text(
                                                            $"Cash: {Money(model.CashAmount)}");

                                                    totals.Item()
                                                        .Text(
                                                            $"Payment method: {model.PaymentMethod}");

                                                    totals.Item()
                                                        .Text(
                                                            $"Status: {model.PaymentStatus}")
                                                        .Bold();

                                                    if (
                                                        model.RefundedPoints >
                                                        0)
                                                    {
                                                        totals.Item()
                                                            .Text(
                                                                $"Refunded: {model.RefundedPoints:N0} points")
                                                            .Bold();
                                                    }
                                                });

                                        column.Item()
                                            .PaddingTop(18)
                                            .Text(
                                                $"Verification: {Money(model.TotalAmount)} = {model.PointsApplied:N0} × 1,000 VND + {Money(model.CashAmount)}");
                                    });

                            page.Footer()
                                .AlignCenter()
                                .Text(
                                    "SportHub — This receipt was generated from the server payment record.");
                        });
                });

        return document.GeneratePdf();
    }

    public string RenderHtml(
        InvoiceReceiptModel model)
    {
        static string E(
            string? value)
            =>
                WebUtility.HtmlEncode(
                    value ??
                    string.Empty);

        var rows =
            string.Join(
                "",
                model.Items.Select(
                    item =>
                        $"""
                        <tr>
                          <td style="padding:10px;border-bottom:1px solid #ddd">{E(item.Description)}</td>
                          <td style="padding:10px;border-bottom:1px solid #ddd;text-align:right">{item.Quantity}</td>
                          <td style="padding:10px;border-bottom:1px solid #ddd;text-align:right">{Money(item.UnitPrice)}</td>
                          <td style="padding:10px;border-bottom:1px solid #ddd;text-align:right">{Money(item.LineAmount)}</td>
                        </tr>
                        """));

        var refund =
            model.RefundedPoints > 0
                ? $"""
                  <p style="margin:6px 0;color:#b42318">
                    <strong>Refunded points:</strong>
                    {model.RefundedPoints:N0}
                  </p>
                  """
                : "";

        return $"""
        <!doctype html>
        <html>
        <body style="font-family:Arial,sans-serif;background:#f6f8fa;padding:24px;color:#111">
          <div style="max-width:760px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:12px;padding:28px">

            <h1 style="margin:0">SPORTHUB</h1>
            <h2 style="margin-top:8px">Payment receipt</h2>

            <p>
              Payment for invoice
              <strong>{E(model.InvoiceNumber)}</strong>
              has been verified by SportHub.
            </p>

            <hr style="border:0;border-top:1px solid #ddd">

            <p><strong>Invoice:</strong> {E(model.InvoiceNumber)}</p>
            <p><strong>Issued:</strong> {FormatDate(model.IssuedAt)}</p>
            <p><strong>Cashier:</strong> {E(model.CashierName)}</p>

            <h3>Member</h3>

            <p><strong>Name:</strong> {E(model.MemberName)}</p>
            <p><strong>Email:</strong> {E(model.MemberEmail)}</p>
            <p><strong>Phone:</strong> {E(model.MemberPhone ?? "-")}</p>

            <h3>Items</h3>

            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#eef3f4">
                  <th style="padding:10px;text-align:left">Item</th>
                  <th style="padding:10px;text-align:right">Qty</th>
                  <th style="padding:10px;text-align:right">Price</th>
                  <th style="padding:10px;text-align:right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows}
              </tbody>
            </table>

            <div style="margin-top:24px;text-align:right">
              <p><strong>Total:</strong> {Money(model.TotalAmount)}</p>

              <p>
                <strong>Points:</strong>
                {model.PointsApplied:N0} points
                ({Money(model.PointsValue)})
              </p>

              <p><strong>Cash:</strong> {Money(model.CashAmount)}</p>

              <p><strong>Payment method:</strong> {E(model.PaymentMethod)}</p>

              <p><strong>Status:</strong> {E(model.PaymentStatus)}</p>

              {refund}
            </div>

            <p style="margin-top:24px;font-size:13px;color:#555">
              TotalAmount = PointsApplied × 1,000 VND + CashAmount
            </p>

            <p style="font-size:13px;color:#555">
              A PDF copy of this receipt is attached to this email.
            </p>

          </div>
        </body>
        </html>
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
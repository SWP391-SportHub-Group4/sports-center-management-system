using System.Text.Json;
using SportHub.BuildingBlocks.Api;
using SportHub.Payment.Domain.Enums;
using SportHub.Payment.Domain.Rules;

namespace SportHub.Payment.Tests.Unit;

public sealed class WireEnumTests
{
    private sealed record Contract([property: WireEnum] string Status, string Message);

    [Theory]
    [InlineData("PendingApproval", "PENDING_APPROVAL")]
    [InlineData("PaidAfterReconciliation", "PAID_AFTER_RECONCILIATION")]
    [InlineData("CancelledOnTime", "CANCELLED_ON_TIME")]
    [InlineData("NoShow", "NO_SHOW")]
    [InlineData("PT", "PT")]
    public void Enum_strings_have_canonical_wire_names_without_rewriting_free_text(string value, string wire)
    {
        var json = JsonSerializer.Serialize(new Contract(value, "Do not change NO_SHOW"));
        using var parsed = JsonDocument.Parse(json);
        Assert.Equal(wire, parsed.RootElement.GetProperty("Status").GetString());
        Assert.Equal("Do not change NO_SHOW", parsed.RootElement.GetProperty("Message").GetString());
        Assert.Equal(value, JsonSerializer.Deserialize<Contract>(json)!.Status);
    }

    [Fact]
    public void Query_enum_parser_accepts_wire_names_and_rejects_numeric_values()
    {
        Assert.True(WireEnum.TryParse<InvoiceStatus>("PAID_AFTER_RECONCILIATION", true, out var result));
        Assert.Equal(InvoiceStatus.PaidAfterReconciliation, result);
        Assert.False(WireEnum.TryParse<InvoiceStatus>("2", true, out _));
        Assert.False(WireEnum.TryParse<InvoiceStatus>("Unknown", true, out _));
    }

    [Theory]
    [InlineData(InvoiceStatus.PaidAfterReconciliation, "VnPayAfterReconciliation", false, "Fulfilled")]
    [InlineData(InvoiceStatus.PaidAfterReconciliation, "VnPayCompensated", false, "Compensated")]
    [InlineData(InvoiceStatus.PaidAfterReconciliation, "VnPayManualCompensation", true, "ReconciliationRequired")]
    [InlineData(InvoiceStatus.Issued, null, false, "Pending")]
    public void Reconciled_cash_is_not_assumed_to_have_purchased_benefits(InvoiceStatus status, string? via, bool pending, string outcome)
        => Assert.Equal(outcome, InvoiceFulfillment.Outcome(status, via, pending));
}

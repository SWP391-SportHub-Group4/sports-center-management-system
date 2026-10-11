namespace SportHub.Payment.Tests.Integration;

public sealed class ModuleBoundaryTests
{
    [Fact]
    public void Payment_and_scheduling_use_ports_without_circular_references()
    {
        var payment = typeof(SportHub.Payment.Application.Services.CheckoutService).Assembly;
        var scheduling = typeof(SportHub.Scheduling.Rental.Application.CourtRentalService).Assembly;
        Assert.DoesNotContain(payment.GetReferencedAssemblies(), x => x.Name == scheduling.GetName().Name);
        Assert.DoesNotContain(scheduling.GetReferencedAssemblies(), x => x.Name == payment.GetName().Name);
        var ports = typeof(SportHub.BuildingBlocks.Abstractions.Reporting.IRevenueDimensionReader).Assembly;
        Assert.DoesNotContain(ports.GetReferencedAssemblies(), x => x.Name is not null
            && x.Name.StartsWith("SportHub.", StringComparison.Ordinal));
    }
}

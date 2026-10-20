using System.ComponentModel.DataAnnotations;
using SportHub.Scheduling.Catalog.Application;

namespace SportHub.Scheduling.Application.Commands;

public sealed class CreateRentalCourtRequest
{
    [Required, MinLength(1), MaxLength(100)]
    public string Name { get; set; } = string.Empty;
    [Range(1, 500)]
    public int Capacity { get; set; }
    // Optional legacy compatibility key; new clients choose Sport only.
    [Range(0, int.MaxValue)]
    public int RoomTypeId { get; set; }
    [Range(1, int.MaxValue)]
    public int SportId { get; set; }
    [Required, MinLength(1), MaxLength(7)]
    public List<OpeningHourInput> Hours { get; set; } = [];
    [Required, MinLength(1), MaxLength(49)]
    public List<SaveCourtRateRequest> Rates { get; set; } = [];
}

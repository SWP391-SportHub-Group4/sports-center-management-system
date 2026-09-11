namespace SportHub.Repository.Entities;

public class MembershipPackage
{
    public int PackageId { get; set; } // PK

    public string Name { get; set; } = string.Empty; // unique trong catalog

    public decimal Price { get; set; }

    public int DurationDays { get; set; } // thời hạn sử dụng gói

    public int? SessionLimit { get; set; } // null = không giới hạn số buổi

    public ICollection<MemberPackage> MemberPackages { get; set; } = new List<MemberPackage>();
}

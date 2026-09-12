namespace SportHub.Scheduling.Domain.Entities;

public class ClassRecurrence
{
    public int RecurrenceId { get; set; } // PK

    public int ClassId { get; set; } // FK -> Class

    public Class? Class { get; set; }

    public string DaysOfWeek { get; set; } = string.Empty; // vd "MON,WED,FRI"

    public TimeOnly StartTimeLocal { get; set; } // giờ địa phương, không phải UTC

    public TimeOnly EndTimeLocal { get; set; }

    public string Timezone { get; set; } = string.Empty; // vd "Asia/Ho_Chi_Minh"

    public DateOnly EffectiveFrom { get; set; } // khoảng thời gian pattern còn áp dụng

    public DateOnly? EffectiveTo { get; set; }

    public ICollection<ClassSession> Sessions { get; set; } = new List<ClassSession>();
}

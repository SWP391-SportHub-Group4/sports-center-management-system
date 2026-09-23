using SportHub.Identity.Domain.Entities;

namespace SportHub.Scheduling.Domain.Entities;

public class Class
{
    public int ClassId { get; set; } // PK

    public string Name { get; set; } = string.Empty;

    public string Discipline { get; set; } = string.Empty; // PersonalTraining/Yoga/GroupX (xem Domain/Constants/Disciplines.cs) — dùng để filter.
                                                           // KHÔNG có Gym: Gym ra vào tự do, đi qua GymCheckIn (BR-64).

    public int DefaultRoomId { get; set; } // FK -> Room

    public Room? DefaultRoom { get; set; }

    public Guid? DefaultCoachId { get; set; } // FK -> UserAccount, có thể override ở từng session

    public UserAccount? DefaultCoach { get; set; }

    public int Capacity { get; set; } // sức chứa mặc định của lớp

    public ClassStatus Status { get; set; } // Active/Archived — không xoá cứng khi ngừng mở

    public ICollection<ClassRecurrence> Recurrences { get; set; } = new List<ClassRecurrence>();
    public ICollection<ClassSession> Sessions { get; set; } = new List<ClassSession>();
}

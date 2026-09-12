namespace SportHub.Scheduling.Domain.Entities;

public class Room
{
    public int RoomId { get; set; } // PK

    public string Name { get; set; } = string.Empty; // unique toàn trung tâm

    public int Capacity { get; set; } // trần sức chứa vật lý

    public ICollection<Class> Classes { get; set; } = new List<Class>();
    public ICollection<ClassSession> Sessions { get; set; } = new List<ClassSession>();
}

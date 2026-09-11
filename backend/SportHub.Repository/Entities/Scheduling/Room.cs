namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Scheduling.
// Danh mục phòng tập vật lý của trung tâm.
public class Room
{
    public int RoomId { get; set; }

    // Unique toàn trung tâm (BR-57, ràng buộc #14).
    public string Name { get; set; } = string.Empty;

    // Trần sức chứa vật lý — dùng để tính ClassSession.capacity = MIN(Room, Class) (BR-51).
    public int Capacity { get; set; }

    public ICollection<Class> Classes { get; set; } = new List<Class>();
    public ICollection<ClassSession> Sessions { get; set; } = new List<ClassSession>();
}

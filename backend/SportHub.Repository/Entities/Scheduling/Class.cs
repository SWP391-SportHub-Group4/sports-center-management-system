using SportHub.Repository.Enums;

namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Scheduling.
// Định nghĩa LOẠI lớp (vd "Yoga cơ bản") — là template, không phải 1 buổi học cụ
// thể (đó là ClassSession).
public class Class
{
    public int ClassId { get; set; }

    public string Name { get; set; } = string.Empty;

    // Bộ môn (Yoga, Gym, Boxing...) — filter/tìm kiếm.
    public string Discipline { get; set; } = string.Empty;

    public int DefaultRoomId { get; set; }

    public Room? DefaultRoom { get; set; }

    // Nullable — HLV mặc định, có thể override ở từng session.
    public Guid? DefaultCoachId { get; set; }

    public UserAccount? DefaultCoach { get; set; }

    // Sức chứa mặc định của lớp — 1 trong 2 yếu tố tính MIN(Room, Class) cho session (BR-51).
    public int Capacity { get; set; }

    // ACTIVE/ARCHIVED — lớp ngừng mở không xóa cứng (giữ lịch sử session/enrollment cũ).
    public ClassStatus Status { get; set; }

    public ICollection<ClassRecurrence> Recurrences { get; set; } = new List<ClassRecurrence>();
    public ICollection<ClassSession> Sessions { get; set; } = new List<ClassSession>();
    public ICollection<CoachMemberRelationship> CoachMemberRelationships { get; set; } = new List<CoachMemberRelationship>();
}

namespace SportHub.Scheduling.Catalog.Domain;

/// <summary>Thu hẹp loại phòng cho một dịch vụ (hiện chỉ PersonalTraining). Tập rỗng nghĩa là dịch vụ không gắn phòng.</summary>
public class ServiceRoomType
{
    public int OfferingId { get; set; }

    public int RoomTypeId { get; set; }
}

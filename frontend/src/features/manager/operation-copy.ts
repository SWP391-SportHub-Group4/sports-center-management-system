import { useLanguage } from "@/lib/language";

const copy = {
  en: {
    preferences: "Schedule preferences",
    weeklyTime: "Time for selected weekdays",
    generate: "Generate suggestions",
    aiBlocked:
      "Suggestions are unavailable until G03 is connected. No schedule has been generated or checked by AI.",
    manualReview: "Review and edit manually",
    manualHint:
      "These are your inputs, not an AI proposal. Continue in the class editor to check the schedule, review pricing and save a draft separately.",
    manualCreate: "Create a class manually",
    pending: "In progress",
    succeeded: "Confirmed by server",
    failed: "Rejected by server",
    unknown: "Outcome unknown — check before retrying",
    ready: "Not processed",
    results: "Step results in this session",
    resultsHint:
      "Each step is independent. A later failure does not undo earlier confirmed steps.",
    emptyImpacts:
      "No affected activities were returned for this preview. Recheck before confirming the final operation.",
    impactCount: "Affected activities",
    detailsUnavailable:
      "Display details are unavailable; the source ID and preview times remain below.",
    finalStep: "Final incident operation",
    finalHint:
      "The API confirmed the final operation. Individual refund amounts and references are not available in this contract; see the audit log and delivery status.",
    blockUnsupported:
      "This block has no supported removal action. Resolve it separately before continuing.",
    rentalPending:
      "Cancellation and release will be requested with the final operation; not completed yet.",
    rentalConfirmed:
      "The rental will be cancelled and the member notified. The member then chooses 100% as points (listed under Members affected) or sends a refund request.",
    holdWindow: "Hold this window while I fix it",
    holdWindowHint:
      "Nobody can book into this room and time until you resolve the incident, release it, or the hold runs out (2 hours). You can leave and come back.",
    holdWindowDone: "Window held. New bookings in it are blocked.",
    fencesTitle: "Incidents in progress",
    fencesHint:
      "Windows you are holding. Pick one up where you left it, keep it held, or give it back.",
    fencesNone: "No incident is being held.",
    fenceCenter: "Whole center",
    fenceLeft: "{n} activities still in the window",
    fenceClear: "Nothing left in the window: ready to resolve",
    fenceMembers: "{n} members affected",
    fenceHeldUntil: "Held until {time}",
    fenceExpired: "Hold lapsed, bookings allowed",
    fenceContinue: "Continue",
    fenceExtend: "Hold again",
    fenceRelease: "Release",
    fenceChanges: "{n} schedule changes made while held",
    fenceAbandon: "Abandon and undo",
    abandonTitle: "Abandon this incident?",
    abandonLead:
      "The window is released and the changes below are put back where they were. Members are told when a session returns to its original time.",
    abandonNone:
      "No schedule change was made while this window was held, so only the hold is released.",
    abandonKeep:
      "Each change is only undone if the session is still exactly as that change left it and its old slot is still free. Anything else is left as it is and listed afterwards.",
    abandonConfirm: "Abandon and undo",
    abandonPast: "The original time has passed, so this cannot be undone.",
    abandonDone: "{n} changes undone.",
    abandonLeft: "These were left as they are:",
    abandonMoved: "{from} to {to}",
    abandonKinds: {
      RESCHEDULE: "Session moved",
      CANCEL_WITH_MAKEUP: "Session cancelled for a makeup",
      REVIEWED_COMPLETED: "Fully delivered session recorded",
      REMOVE_ROOM_BLOCK: "Room block removed",
    } as Record<string, string>,
    membersAffected: "Members affected",
    unnamedMember: "Member",
    affectedSessions: "{n} sessions affected",
    member: "Member",
    outcome: "What happens",
    expectedPoints: "Points offered",
    expectedTotal: "Points offered in total",
    quoteNote:
      "Quoted by the server now. Final amounts are calculated again when the member chooses.",
    outcomes: {
      REFUNDED_AS_POINTS: "Rental cancelled; member chooses 100% as points or a refund request",
      CHECKOUT_RELEASED: "Unpaid checkout released, held points returned",
      AWAITS_SCHEDULE_DECISION:
        "Needs a schedule decision first (reschedule or makeup); no refund yet",
    } as Record<string, string>,
    recipientCount: "Selected recipients",
    channels: "Delivery channels",
    localReview:
      "Review the selected recipients and delivery channels before sending.",
    audienceChanged:
      "The audience has changed. Select recipients again and review before sending.",
    noRecipients:
      "No matching recipients on this page. Try another page or adjust the filters.",
    invalidSelection:
      "Some selected recipients no longer match the loaded schedule. Remove them or select the audience again.",
    deliveryHint:
      "Queued, sent, failed and read counts come from the server. Refresh only checks delivery; it does not send another notice or repeat refunds.",
    recoveryOnly:
      "A previous request is being checked. Editing and new sends are locked until its outcome is known.",
    recoveryNotFound:
      "No receipt was found for this key. You may start a new notice and review it again.",
    clearRecovery: "Start a new notice",
    currentInputs: "Current inputs for manual review",
    recorded: "Recorded at",
    invalidReceipt:
      "The response has no valid receipt ID. Check the request outcome before retrying.",
  },
  vi: {
    preferences: "Thông số lịch",
    weeklyTime: "Giờ cho các thứ đã chọn",
    generate: "Sinh gợi ý lịch",
    aiBlocked:
      "Chưa thể sinh gợi ý khi G03 chưa được kết nối. Chưa có lịch nào được AI tạo hoặc kiểm tra.",
    manualReview: "Xem lại và chỉnh lịch thủ công",
    manualHint:
      "Đây là thông số bạn nhập, không phải gợi ý AI. Tiếp tục trong form lớp để kiểm tra lịch, xem lại giá và lưu nháp bằng thao tác riêng.",
    manualCreate: "Tạo lớp thủ công",
    pending: "Đang xử lý",
    succeeded: "Server đã xác nhận",
    failed: "Server đã từ chối",
    unknown: "Chưa rõ kết quả — kiểm tra trước khi thử lại",
    ready: "Chưa xử lý",
    results: "Kết quả từng bước trong phiên này",
    resultsHint:
      "Mỗi bước là thao tác riêng. Bước sau lỗi không hoàn tác bước đã được xác nhận.",
    emptyImpacts:
      "Preview không trả về hoạt động bị ảnh hưởng. Kiểm tra lại trước khi xác nhận thao tác cuối.",
    impactCount: "Hoạt động bị ảnh hưởng",
    detailsUnavailable:
      "Chưa tải được tên hiển thị; mã nguồn và thời gian từ preview vẫn được giữ bên dưới.",
    finalStep: "Thao tác xử lý sự cố cuối",
    finalHint:
      "API đã xác nhận thao tác cuối. Contract hiện chưa trả số điểm và mã hoàn của từng lượt; xem nhật ký và trạng thái thông báo.",
    blockUnsupported:
      "Block này không có thao tác gỡ được hỗ trợ. Cần xử lý riêng trước khi tiếp tục.",
    rentalPending:
      "Sẽ yêu cầu hủy và nhả phần giữ khi xác nhận thao tác cuối; chưa xử lý.",
    rentalConfirmed:
      "Sẽ yêu cầu hủy và hoàn điểm khi xác nhận thao tác cuối; số điểm dự kiến nằm ở mục Hội viên bị ảnh hưởng.",
    holdWindow: "Giữ khung giờ này trong lúc xử lý",
    holdWindowHint:
      "Không ai đặt được phòng và giờ này cho đến khi bạn xử lý xong, nhả giữ, hoặc hết 2 giờ. Bạn có thể rời đi và quay lại.",
    holdWindowDone: "Đã giữ khung giờ. Đặt mới trong khung này bị chặn.",
    fencesTitle: "Sự cố đang xử lý",
    fencesHint:
      "Các khung giờ bạn đang giữ. Tiếp tục từ chỗ dở, giữ thêm, hoặc nhả.",
    fencesNone: "Không có sự cố nào đang được giữ.",
    fenceCenter: "Toàn trung tâm",
    fenceLeft: "Còn {n} hoạt động trong khung giờ",
    fenceClear: "Không còn gì trong khung giờ: sẵn sàng xác nhận",
    fenceMembers: "{n} hội viên bị ảnh hưởng",
    fenceHeldUntil: "Giữ đến {time}",
    fenceExpired: "Hết giữ, cho phép đặt",
    fenceContinue: "Tiếp tục",
    fenceExtend: "Giữ lại",
    fenceRelease: "Nhả",
    fenceChanges: "{n} thay đổi lịch đã làm trong lúc giữ",
    fenceAbandon: "Bỏ và hoàn tác",
    abandonTitle: "Bỏ sự cố này?",
    abandonLead:
      "Khung giờ được nhả và các thay đổi dưới đây được trả về như cũ. Hội viên được báo khi buổi quay lại giờ ban đầu.",
    abandonNone:
      "Chưa có thay đổi lịch nào trong lúc giữ, nên chỉ nhả khung giờ.",
    abandonKeep:
      "Mỗi thay đổi chỉ được hoàn tác khi buổi vẫn đúng như thay đổi đó để lại và chỗ cũ còn trống. Phần còn lại giữ nguyên và được liệt kê sau đó.",
    abandonConfirm: "Bỏ và hoàn tác",
    abandonPast: "Giờ ban đầu đã qua nên không thể hoàn tác.",
    abandonDone: "Đã hoàn tác {n} thay đổi.",
    abandonLeft: "Các thay đổi sau được giữ nguyên:",
    abandonMoved: "{from} sang {to}",
    abandonKinds: {
      RESCHEDULE: "Buổi bị dời",
      CANCEL_WITH_MAKEUP: "Buổi bị hủy để học bù",
      REVIEWED_COMPLETED: "Đã ghi nhận buổi học đầy đủ",
      REMOVE_ROOM_BLOCK: "Khóa phòng bị gỡ",
    } as Record<string, string>,
    membersAffected: "Hội viên bị ảnh hưởng",
    unnamedMember: "Hội viên",
    affectedSessions: "{n} buổi bị ảnh hưởng",
    member: "Hội viên",
    outcome: "Phương án xử lý",
    expectedPoints: "Điểm dự kiến",
    expectedTotal: "Tổng điểm hoàn dự kiến",
    quoteNote:
      "Server báo giá ngay lúc này. Số điểm cuối được tính lại khi bạn xác nhận.",
    outcomes: {
      REFUNDED_AS_POINTS: "Hủy lượt thuê, hoàn 100% bằng điểm",
      CHECKOUT_RELEASED: "Nhả đơn chưa thanh toán, trả lại điểm đang giữ",
      AWAITS_SCHEDULE_DECISION:
        "Cần quyết định lịch trước (dời buổi hoặc buổi bù); chưa hoàn điểm",
    } as Record<string, string>,
    recipientCount: "Người nhận đã chọn",
    channels: "Kênh gửi",
    localReview:
      "Kiểm tra người nhận đã chọn và các kênh gửi trước khi gửi thông báo.",
    audienceChanged:
      "Nhóm người nhận đã thay đổi. Hãy chọn lại và xem lại trước khi gửi.",
    noRecipients:
      "Không có người nhận phù hợp trên trang này. Thử trang khác hoặc đổi bộ lọc.",
    invalidSelection:
      "Một số người đã chọn không còn khớp lịch đang tải. Hãy bỏ chọn hoặc chọn lại nhóm người nhận.",
    deliveryHint:
      "Số lượng chờ gửi, đã gửi, lỗi và đã đọc lấy từ server. Làm mới chỉ kiểm tra trạng thái, không gửi lại thông báo hay hoàn điểm lại.",
    recoveryOnly:
      "Đang kiểm tra yêu cầu trước. Chỉnh sửa và gửi mới bị khóa cho đến khi xác định được kết quả.",
    recoveryNotFound:
      "Không tìm thấy receipt của mã này. Bạn có thể bắt đầu thông báo mới và xem lại trước khi gửi.",
    clearRecovery: "Bắt đầu thông báo mới",
    currentInputs: "Thông số hiện tại để xem lại thủ công",
    recorded: "Thời điểm ghi nhận",
    invalidReceipt:
      "Phản hồi chưa có mã receipt hợp lệ. Kiểm tra kết quả yêu cầu trước khi thử lại.",
  },
};

export function useOperationsCopy() {
  const { language } = useLanguage();
  return copy[language];
}

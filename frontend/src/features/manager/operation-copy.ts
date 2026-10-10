import { useLanguage } from "@/lib/language";

const copy = {
  en: {
    preferences: "Schedule preferences",
    weeklyTime: "Time for selected weekdays",
    generate: "Generate suggestions",
    aiBlocked:
      "AI suggestions are currently unavailable. You can review and edit the schedule manually.",
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
      "Cancellation and refund will be requested with the final operation; no refund quote is available here.",
    recipientCount: "Selected recipients",
    channels: "Delivery channels",
    localReview:
      "Check the selected recipients before sending. Recipient eligibility is checked when the notice is sent.",
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
      "Gợi ý AI hiện chưa khả dụng. Bạn có thể xem lại và chỉnh lịch thủ công.",
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
      "Sẽ yêu cầu hủy và hoàn điểm khi xác nhận thao tác cuối; chưa có quote hoàn tại đây.",
    recipientCount: "Người nhận đã chọn",
    channels: "Kênh gửi",
    localReview:
      "Kiểm tra người nhận đã chọn trước khi gửi. Điều kiện nhận thông báo được kiểm tra khi gửi.",
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

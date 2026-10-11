/**
 * CONTRACT — Checkout dùng chung cho Member / Quầy lễ tân.
 *
 * Nguyên tắc cứng (đặc tả A15, mục 3 của 01-AN-MEMBER-SHARED.md):
 *  1. Frontend KHÔNG tự tính tiền. total / pointsApplied / cashAmount là số do server trả
 *     (CheckoutDto); view-model chỉ ĐỊNH DẠNG và đặt tên lại.
 *  2. Người mua được xác định bằng server (beneficiary / initiator) — không suy ra từ role trong URL.
 *  3. Hạn giữ chỗ tính từ `expiresAtUtc − serverNowUtc` (offset đồng hồ), không từ đồng hồ máy khách.
 *  4. Return từ cổng thanh toán KHÔNG chứng minh đã thu tiền: chỉ tin `invoiceStatus` +
 *     `fulfillmentOutcome` đọc lại từ backend.
 *
 * Ba ngữ cảnh người mua chỉ khác `mode`, `pointsAuth` và hành động tiếp theo; layout và logic
 * điểm/hết hạn là MỘT. Hào (quầy) viết adapter, không fork component.
 */
import type { CheckoutDto } from "@/lib/types";

export type CheckoutKind = CheckoutDto["kind"];

export type CheckoutMode =
  /** Member tự mua cho mình. */
  | "SELF"
  /** Lễ tân thao tác thay Member — dùng điểm cần OTP email của Member. */
  | "COUNTER";

export type CheckoutPointsAuth =
  /** Gửi số điểm thẳng qua API self (Member). */
  | "SELF"
  /** Phải xin OTP gửi email Member rồi xác minh (5 phút, tối đa 5 lần sai). */
  | "OTP_EMAIL";

export interface CheckoutParty {
  userId: string;
  /** Tên hiển thị nếu server/ngữ cảnh đã có; để trống thì UI chỉ hiện vai trò. */
  displayName?: string;
}

/** Trạng thái hiển thị gộp từ invoiceStatus + fulfillmentOutcome — thứ tự ưu tiên từ trên xuống. */
export type CheckoutPhase =
  | "RECONCILIATION_REQUIRED" // đã thu cần đối soát: không báo thành công
  | "COMPENSATED" // thanh toán muộn, không còn chỗ → đã bồi hoàn điểm (KHÁC "đăng ký thành công")
  | "FULFILLED" // đã thành công và quyền lợi đã cấp
  | "PAID_PENDING_FULFILLMENT" // đã thu nhưng chưa cấp quyền lợi → hỏi lại backend
  | "VOID" // hủy/hết hạn
  | "AWAITING_PAYMENT"; // còn hạn, chưa thu đủ

export interface CheckoutViewModel {
  invoiceId: string;
  checkoutSessionId: string;
  /** Tăng khi server đổi nội dung đơn; request chọn điểm phải gửi kèm để tránh ghi đè mù. */
  revision: number;
  kind: CheckoutKind;
  mode: CheckoutMode;
  pointsAuth: CheckoutPointsAuth;
  beneficiary: CheckoutParty;
  /** Người thao tác; khác beneficiary khi mode = COUNTER. */
  initiator: CheckoutParty;

  // ---- số tiền (đồng) và điểm — nguyên văn từ server, chưa tính lại ----
  totalAmount: number;
  pointsApplied: number;
  cashAmount: number;

  // ---- hạn giữ chỗ ----
  expiresAtUtc: string;
  serverNowUtc: string;

  phase: CheckoutPhase;
  /** true khi server yêu cầu đối soát thủ công. */
  reconciliationRequired: boolean;
  /** Bước thanh toán tiếp theo suy ra từ số liệu server, để UI chọn CTA. */
  next: "CONFIRM_POINTS" | "PAY_WITH_GATEWAY" | "NONE";
}

/** Dữ liệu ngữ cảnh mà nơi gọi (adapter) cấp, vì CheckoutDto không mang vai trò người dùng. */
export interface CheckoutContext {
  mode: CheckoutMode;
  beneficiaryName?: string;
  initiatorName?: string;
}

export function derivePhase(
  dto: Pick<
    CheckoutDto,
    "invoiceStatus" | "fulfillmentOutcome" | "reconciliationRequired"
  >,
): CheckoutPhase {
  if (
    dto.reconciliationRequired ||
    dto.fulfillmentOutcome === "RECONCILIATION_REQUIRED"
  )
    return "RECONCILIATION_REQUIRED";
  if (dto.fulfillmentOutcome === "COMPENSATED") return "COMPENSATED";
  if (dto.fulfillmentOutcome === "FULFILLED") return "FULFILLED";
  if (
    dto.invoiceStatus === "PAID" ||
    dto.invoiceStatus === "PAID_AFTER_RECONCILIATION"
  )
    return "PAID_PENDING_FULFILLMENT";
  if (dto.invoiceStatus === "VOID") return "VOID";
  return "AWAITING_PAYMENT";
}

/** Chuyển DTO của server thành view-model. Hàm thuần: không gọi API, không tính lại tiền. */
export function toCheckoutViewModel(
  dto: CheckoutDto,
  context: CheckoutContext,
): CheckoutViewModel {
  const phase = derivePhase(dto);
  const pending = phase === "AWAITING_PAYMENT";

  return {
    invoiceId: dto.invoiceId,
    checkoutSessionId: dto.checkoutSessionId,
    revision: dto.revision,
    kind: dto.kind,
    mode: context.mode,
    pointsAuth: context.mode === "COUNTER" ? "OTP_EMAIL" : "SELF",
    beneficiary: {
      userId: dto.beneficiaryUserId,
      displayName: context.beneficiaryName,
    },
    initiator: {
      userId: dto.initiatorUserId,
      displayName: context.initiatorName,
    },
    totalAmount: dto.totalAmount,
    pointsApplied: dto.pointsApplied,
    cashAmount: dto.cashAmount,
    expiresAtUtc: dto.expiresAtUtc,
    serverNowUtc: dto.serverNowUtc,
    phase,
    reconciliationRequired: dto.reconciliationRequired,
    next: !pending
      ? "NONE"
      : dto.cashAmount === 0
        ? "CONFIRM_POINTS"
        : "PAY_WITH_GATEWAY",
  };
}

/**
 * Giây còn lại của hạn giữ chỗ.
 * @param clientElapsedMs thời gian đã trôi trên máy khách kể từ lúc nhận `serverNowUtc`
 *   (đo bằng performance.now() hoặc chênh lệch Date.now()), để reload/đổi tab không reset đồng hồ:
 *   mỗi lần refetch checkout, đồng hồ được hiệu chỉnh lại từ serverNowUtc mới.
 */
export function remainingSeconds(
  expiresAtUtc: string,
  serverNowUtc: string,
  clientElapsedMs = 0,
): number {
  const serverNow = Date.parse(serverNowUtc) + clientElapsedMs;

  return Math.max(0, Math.ceil((Date.parse(expiresAtUtc) - serverNow) / 1000));
}

/**
 * Quy ước lỗi/edge case checkout đã có contract ở backend (hiển thị đúng, không tự suy ra):
 * điểm = 0 · đủ điểm · split · vượt số dư · điểm đổi ở tab khác · OTP sai/hết hạn/hết lượt ·
 * hold gần hết/hết · VNPay pending/fail · đã thu cần đối soát · thanh toán muộn (giữ được chỗ /
 * không còn chỗ → bồi hoàn) · hủy checkout · bấm đúp. Khi timer về 0: dừng thao tác cũ và REFETCH;
 * frontend không có quyền "release slot".
 */

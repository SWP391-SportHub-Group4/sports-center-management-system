/** Error messages are local: no model request is made after a provider failure. */
export function chatFailureMessage(error, fallback, question) {
  const q = String(question || "").normalize("NFC").toLowerCase();
  const vi = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(q) ||
    /\b(toi|minh|ban|khong|giup|cho|bao nhieu|lich|lop|goi|tap|thong bao|diem|tai khoan|nhu the nao|o dau|khi nao|co the)\b/i.test(q);
  if (!error) return vi ? 'Tôi chưa thể xử lý câu hỏi do lỗi kết nối. Vui lòng thử lại.' : 'I cannot process your question because of a connection problem. Please try again.';
  const {status, code} = error;
  if (status === 401 || status === 403) return vi ? 'Tôi không thể truy cập dữ liệu tài khoản. Vui lòng đăng nhập lại hoặc kiểm tra quyền truy cập.' : 'I cannot access your account data. Please sign in again or check your permissions.';
  if (status === 429 || code === 'ai_provider_rate_limited' || code === 'ai_quota_exceeded') return vi ? 'Dịch vụ AI đang giới hạn yêu cầu. Vui lòng thử lại sau.' : 'The AI service is rate limited. Please try again later.';
  if (code === 'ai_provider_auth_failed' || code === 'ai_model_unavailable') return vi ? 'Dịch vụ AI chưa sẵn sàng. Vui lòng liên hệ hỗ trợ.' : 'The AI service is not available. Please contact support.';
  if (status === 504 || code === 'ai_service_timeout' || code === 'ai_provider_timeout') return vi ? 'Dịch vụ AI phản hồi quá lâu. Tôi chưa thể xác minh câu trả lời; vui lòng thử lại.' : 'The AI service timed out. I cannot verify an answer; please try again.';
  if ([502,503].includes(status) || ['ai_service_error','ai_service_unavailable','flow6_chat_failed','flow6_invalid_model_output','member_ai_answer_failed','member_ai_answer_empty','ai_provider_empty_answer','ai_provider_unavailable','member_gemini_data_hub_unavailable'].includes(code)) return vi ? 'Tôi chưa thể phân tích câu hỏi lúc này. Vui lòng thử lại hoặc diễn đạt lại câu hỏi.' : 'I cannot analyze your question right now. Please try again or rephrase it.';
  return fallback;
}

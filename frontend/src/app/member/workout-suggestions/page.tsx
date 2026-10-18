"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import type { WorkoutSuggestionDto } from "@/lib/types";

export default function MemberWorkoutSuggestionsPage() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [sport, setSport] = useState<"Gym" | "Badminton" | "Basketball">("Gym");
  const [result, setResult] = useState<WorkoutSuggestionDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    if (busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await api.post<WorkoutSuggestionDto>("/api/ai/workout-suggestions/me", undefined, { query: { sport } });
      setResult(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError(vi ? "Vui lòng hoàn thiện Fitness profile trước khi nhận gợi ý." : "Complete your Fitness profile before requesting suggestions.");
      else setError(vi ? "Không tạo được gợi ý. Vui lòng thử lại." : "Could not generate suggestions. Please retry.");
    } finally { setBusy(false); }
  }
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h1>{vi ? "Gợi ý bài tập cá nhân" : "Personal workout suggestions"}</h1>
      <p>{vi ? "Gợi ý dựa trên hồ sơ và lịch sử tập thật trong 30 ngày gần nhất. Đây là bản tham khảo, không phải giáo án đã được Coach phê duyệt." : "Suggestions use your profile and real activity history from the last 30 days. This is guidance, not a coach-approved plan."}</p>
      <label htmlFor="workout-sport">{vi ? "Bộ môn" : "Sport"}</label>{" "}
      <select id="workout-sport" value={sport} onChange={(e) => setSport(e.target.value as typeof sport)}>
        <option value="Gym">Gym</option><option value="Badminton">Badminton</option><option value="Basketball">Basketball</option>
      </select>{" "}
      <button className="btn" type="button" onClick={() => void generate()} disabled={busy}>{busy ? (vi ? "Đang tạo..." : "Generating...") : (vi ? "Gợi ý bài tập" : "Suggest a workout")}</button>
      <p><Link href="/member/training?tab=profile">{vi ? "Xem / cập nhật Fitness profile" : "View / update Fitness profile"}</Link></p>
      {error && <p role="alert">{error}</p>}
      {result && <section aria-label={vi ? "Kết quả gợi ý" : "Suggestions"} style={{ marginTop: 24 }}>
        <h2>{result.sport} — {result.goal}</h2>
        <p>{vi ? "Trình độ" : "Level"}: {result.level}</p>
        <p>{vi ? "30 ngày gần nhất" : "Last 30 days"}: {result.input.sessionsAttended} {vi ? "buổi tham gia" : "attended"}, {result.input.gymCheckIns} Gym check-ins</p>
        <ol style={{ display: "grid", gap: 12 }}>
          {(result.items ?? []).map((item, i) => <li key={i}><strong>{item.exercise}</strong> — {item.sets} sets × {item.reps} reps{item.notes ? <p>{item.notes}</p> : null}</li>)}
        </ol>
        <p>{result.rationale}</p>
        <p><small>{vi ? "Bản tự động theo quy tắc; Coach cần duyệt trước khi sử dụng như giáo án chính thức." : "Rule-based recommendation; a coach must review before adopting it as an official plan."}</small></p>
      </section>}
    </main>
  );
}

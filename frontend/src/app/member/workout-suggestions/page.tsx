"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Info,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { api, ApiError } from "@/lib/apiClient";
import {
  WORKOUT_SUGGESTION_TYPE,
  WORKOUT_SUGGESTION_LABEL,
  type WorkoutSuggestionSourceType,
  type WorkoutSuggestionDto,
  type SportDto,
} from "@/lib/types";
import styles from "./workout-suggestions.module.css";

export default function MemberWorkoutSuggestionsPage() {
  const router = useRouter();
  const [sport, setSport] = useState("Gym");
  const catalog = useApi((signal) => api.get<SportDto[]>("/api/sports", { signal }), []);
  const sports = catalog.data ?? [];
  const sportOptions = Array.from(new Set(["Gym", ...sports.map((item) => item.name)])).filter(Boolean);
  const [result, setResult] = useState<WorkoutSuggestionDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (busy) return;
    if (catalog.loading) return;
    setBusy(true);
    setError("");
    try {
      // Keep the existing API contract and member-scoped authentication.
      const data = await api.post<WorkoutSuggestionDto>(
        "/api/ai/workout-suggestions/me",
        undefined,
        { query: { sport } },
      );
      setResult(data);
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.status === 409 || cause.status === 400)
      ) {
        const detail = cause.message?.trim();
        setError(
          detail
            ? detail.slice(0, 500)
            : "Review and save your Fitness profile, then retry.",
        );
      } else if (cause instanceof ApiError && cause.status === 503) {
        setError(
          "Workout semantic validation is temporarily unavailable. No new workout was generated. Please retry later.",
        );
      } else if (
        cause instanceof ApiError &&
        (cause.status === 401 || cause.status === 403)
      ) {
        setError(
          "Your session does not have access to this feature. Please sign in as a member.",
        );
      } else {
        setError("We couldn't generate your workout right now. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function sendToPlans() {
    if (!result || !result.items?.length) return;
    try {
      const storageKey = "sporthub:member:ai-workout-plans:v1";
      const legacyKey = "sporthub:member:ai-workout-draft:v1";
      const previous = localStorage.getItem(storageKey);
      const parsed: unknown = previous ? JSON.parse(previous) : [];
      const plans: Array<{
        id: string;
        type?: WorkoutSuggestionSourceType;
        suggestion: WorkoutSuggestionDto;
        savedAt: string;
      }> = Array.isArray(parsed)
        ? parsed.map((plan) =>
            plan && typeof plan === "object" && plan.suggestion && !plan.type
              ? { ...plan, type: WORKOUT_SUGGESTION_TYPE }
              : plan,
          )
        : [];

      // Migrate the old single draft so it isn't lost during upgrade.
      const old = sessionStorage.getItem(legacyKey);
      if (old && plans.length === 0) {
        try {
          const legacy = JSON.parse(old) as {suggestion?: WorkoutSuggestionDto; savedAt?: string};
          if (legacy.suggestion && Array.isArray(legacy.suggestion.items)) {
            plans.push({
              id: crypto.randomUUID(),
              type: WORKOUT_SUGGESTION_TYPE,
              suggestion: legacy.suggestion,
              savedAt: legacy.savedAt ?? new Date().toISOString(),
            });
          }
        } catch { /* Ignore invalid legacy data. */ }
      }
      plans.unshift({
        id: crypto.randomUUID(),
        type: WORKOUT_SUGGESTION_TYPE,
        suggestion: result,
        savedAt: new Date().toISOString(),
      });
      localStorage.setItem(storageKey, JSON.stringify(plans));
      sessionStorage.removeItem(legacyKey);
      window.dispatchEvent(new Event("sporthub:ai-plans-changed"));
      router.push("/member/training?tab=plans");
    } catch {
      setError("Unable to save your workout. Please allow browser storage and try again.");
    }
  }

  const items = result?.items ?? [];
  const rationaleItems = result?.rationale
    .split(/\.\s+(?=[A-Z])/)
    .map((sentence, index, sentences) =>
      index < sentences.length - 1 ? `${sentence}.` : sentence,
    )
    .filter(Boolean) ?? [];

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" /> WORKOUT SUGGESTIONS</span>
          <h1>Workout suggestions</h1>
          <p>Build a workout around your saved fitness profile and your activity over the last 30 days.</p>
        </div>
        <div className={styles.heroEmblem} aria-hidden="true"><Dumbbell size={35} /></div>
      </header>

      <section className={styles.setupCard} aria-labelledby="suggestion-setup-title">
        <div className={styles.setupIntro}>
          <div>
            <h2 id="suggestion-setup-title">Create your workout</h2>
            <p>Choose a sport to receive a tailored set of exercises.</p>
          </div>
          <Link className={styles.profileLink} href="/member/training?tab=profile">
            View fitness profile <ChevronRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div className={styles.setupControls}>
          <div className={styles.sportField}>
            <label htmlFor="workout-sport">Sport</label>
            <select
              id="workout-sport"
              value={sport}
              disabled={busy}
              onChange={(event) => {
                setSport(event.target.value);
                setResult(null);
                setError("");
              }}
            >
              {sportOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <button className={styles.generateButton} type="button" onClick={() => void generate()} disabled={busy} aria-busy={busy}>
            {busy ? <RotateCw className={styles.spinning} size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
            {busy ? "Generating workout..." : result ? "Regenerate workout" : "Generate workout"}
          </button>
        </div>
        <p className={styles.setupDisclaimer}>
          <Info size={15} aria-hidden="true" /> Generated suggestions are saved
          under Training → Plans with a “{WORKOUT_SUGGESTION_LABEL}” label. They
          are guidance only.
        </p>
        {error && (
          <section role="status" aria-live="polite" className={styles.emptyState} aria-label="Workout assessment">
            <ShieldCheck size={23} aria-hidden="true" />
            <div>
              <h2>Workout assessment</h2>
              <p>{error}</p>
              <p>No unverified exercise plan was created. Update your Fitness profile if clarification is needed.</p>
              <Link href="/member/training?tab=profile">Review fitness profile</Link>
            </div>
          </section>
        )}
      </section>

      {!result && !busy && !error && (
        <section className={styles.emptyState} aria-label="Before you start">
          <div className={styles.emptyIcon}><ClipboardList size={25} aria-hidden="true" /></div>
          <h2>Your workout will appear here</h2>
          <p>Select a sport and generate your first recommendation. Each exercise will include its sets, reps, and coaching notes.</p>
        </section>
      )}

      {busy && !result && (
        <section className={styles.emptyState} role="status" aria-live="polite">
          <div className={styles.emptyIcon}><RotateCw className={styles.spinning} size={25} aria-hidden="true" /></div>
          <h2>Preparing your workout</h2>
          <p>Reviewing your saved goal, training level, and recent activity.</p>
        </section>
      )}

      {result && (
        <section className={styles.results} aria-label="Workout recommendation" aria-live="polite">
          <div className={styles.resultHeader}>
            <div>
              <span className={styles.resultEyebrow}><CheckCircle2 size={15} aria-hidden="true" /> WORKOUT READY</span>
              <h2>Your {result.sport} workout</h2>
              <p className={styles.goalLine}><Target size={17} aria-hidden="true" /><span>{result.goal}</span></p>
            </div>
            <span className={styles.levelChip}>{result.level}</span>
          </div>

          <div className={styles.stats} aria-label="Workout context">
            <div className={styles.stat}><Dumbbell size={21} aria-hidden="true" /><div><strong>{items.length}</strong><span>Exercises</span></div></div>
            <div className={styles.stat}><CalendarCheck2 size={21} aria-hidden="true" /><div><strong>{result.input.sessionsAttended}</strong><span>Classes attended · 30 days</span></div></div>
            <div className={styles.stat}><Activity size={21} aria-hidden="true" /><div><strong>{result.input.gymCheckIns}</strong><span>Gym check-ins · 30 days</span></div></div>
          </div>

          <div className={styles.sectionHeading}>
            <div><h3>Exercise plan</h3><p>Follow the order below, adjusting intensity to your ability.</p></div>
            <span className={styles.countLabel}>{items.length} exercises</span>
          </div>

          {items.length === 0 ? (
            <div className={styles.emptyExercises}>No exercises were returned. Try generating the workout again.</div>
          ) : (
            <ol className={styles.exerciseList}>
              {items.map((item, index) => (
                <li key={`${index}-${item.exercise}`} className={styles.exerciseCard}>
                  <span className={styles.exerciseNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <div className={styles.exerciseMain}>
                    <h4>{item.exercise}</h4>
                    {item.notes && <p className={styles.exerciseNotes}>{item.notes}</p>}
                  </div>
                  <div className={styles.exerciseMetrics} aria-label={`${item.sets} sets and ${item.reps} reps`}>
                    <span><strong>{item.sets}</strong> {item.sets === 1 ? "set" : "sets"}</span>
                    <span className={styles.metricSeparator} aria-hidden="true">×</span>
                    <span><strong>{item.reps}</strong> {item.reps === 1 ? "rep" : "reps"}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <button
            className={styles.saveButton}
            type="button"
            onClick={sendToPlans}
            disabled={items.length === 0}
          >
            Save suggestion to Plans
            <ArrowRight size={17} aria-hidden="true" />
          </button>

          <section className={styles.explanation} aria-labelledby="why-this-workout">
            <div className={styles.explanationTitle}><Info size={19} aria-hidden="true" /><h3 id="why-this-workout">Why this workout?</h3></div>
            <ul className={styles.explanationList}>
              {rationaleItems.map((sentence, index) => <li key={index}>{sentence}</li>)}
            </ul>
          </section>
          <p className={styles.bottomNote}><ShieldCheck size={17} aria-hidden="true" /> This is an automated, rule-based suggestion—not a coach-approved training plan or medical advice.</p>
        </section>
      )}
    </main>
  );
}

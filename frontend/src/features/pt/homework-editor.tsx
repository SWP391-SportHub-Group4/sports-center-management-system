"use client";
import { useState } from "react";
import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { vietnamUtc, vietnamLocal } from "@/lib/vietnam-time";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { HomeworkDto } from "@/lib/types";
import { ptApi } from "./api";
import { ListPager } from "./ui";
import { PtMemberSelect } from "./member-select";
import { ExerciseEditor, emptyExercise, type ExerciseDraft } from "./exercise-editor";
export function HomeworkEditor({ homework: h, onSaved }: { homework?: HomeworkDto; onSaved: () => void }) {
  const { t } = useLanguage(); const l = t.staffWork; const mutation = useMutation();
  const [member, setMember] = useState(h?.memberId ?? ""); const [title, setTitle] = useState(h?.title ?? ""); const [note, setNote] = useState(h?.coachNote ?? ""); const [due, setDue] = useState(h ? vietnamLocal(h.dueAt) : ""); const [items, setItems] = useState<ExerciseDraft[]>(h?.items ?? [emptyExercise()]);
  return <form className="form" onSubmit={async e => { e.preventDefault(); const body = { memberId: member, title: title.trim(), coachNote: note.trim() || null, dueAt: vietnamUtc(due), items: items.map(({ exercise, sets, reps, notes }) => ({ exercise: exercise.trim(), sets, reps, notes })), version: h?.version }; if (await mutation.run(() => h ? api.put(`/api/coaches/me/homework/${h.assignmentId}`, body) : api.post("/api/coaches/me/homework", body))) onSaved(); }}>
    {h ? <p>{h.memberName}</p> : <PtMemberSelect value={member} onChange={setMember}/>}<Field label={l.title}><input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)}/></Field><Field label={l.due}><input type="datetime-local" required value={due} onChange={e => setDue(e.target.value)}/></Field><Field label={l.note}><textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)}/></Field><ExerciseEditor items={items} onChange={setItems}/><MutationFeedback mutation={mutation}/><button className="btn" disabled={mutation.busy || !member}>{l.save}</button></form>;
}
function HomeworkCard({ h, reload }: { h: HomeworkDto; reload: () => void }) {
  const { t } = useLanguage(); const l = t.staffWork; const [editing, setEditing] = useState(false); const mutation = useMutation();
  async function action(name: string) { if (await mutation.run(() => api.post(`/api/coaches/me/homework/${h.assignmentId}/${name}`, name === "review" ? { version: h.version } : undefined))) reload(); }
  return <Card title={`${h.title} · ${h.memberName}`}><p>{formatDateTime(h.dueAt)} · <StatusChip value={h.status}/></p><p>{h.coachNote}</p><p>{h.memberFeedback}</p><ul>{h.items.map(i => <li key={i.itemId}>{i.exercise} · {i.sets} × {i.reps} · {i.notes}</li>)}</ul><div className="btn-row">{["ASSIGNED", "IN_PROGRESS"].includes(h.status) && <><button className="btn btn--secondary" onClick={() => setEditing(!editing)}>{l.edit}</button><button className="btn btn--danger" disabled={mutation.busy} onClick={() => action("cancel")}>{l.cancel}</button></>}{h.status === "COMPLETED" && <button className="btn" disabled={mutation.busy} onClick={() => action("review")}>{l.review}</button>}</div><MutationFeedback mutation={mutation}/>{editing && <HomeworkEditor homework={h} onSaved={reload}/>}</Card>;
}
export function CoachHomework() { const { t } = useLanguage(); const [page, setPage] = useState(1); const [revision, setRevision] = useState(0); const state = useApi(signal => ptApi.homework(page, signal), [page, revision]); const reload = () => setRevision(r => r + 1); return <><Card title={t.staffWork.assignHomework}><HomeworkEditor key={revision} onSaved={reload}/></Card><AsyncSection state={state}>{rows => <>{rows.map(h => <HomeworkCard key={`${h.assignmentId}-${h.version}`} h={h} reload={reload}/>)}{!rows.length && <p>{t.common.noData}</p>}<ListPager page={page} count={rows.length} onChange={setPage}/></>}</AsyncSection></>; }

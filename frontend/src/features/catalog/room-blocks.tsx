"use client";

import { useState } from "react";
import Link from "next/link";
import { AsyncSection, Dialog, Field } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { vietnamLocal, vietnamUtc } from "@/lib/vietnam-time";
import type { RoomBlockDto } from "@/lib/types";
import { MutationFeedback, useMutation } from "@/features/operations";
import { catalogApi } from "./api";
import styles from "./room-blocks.module.css";

const empty = { start: "", end: "", reason: "" };

export function RoomBlocks({ roomId }: { roomId: number }) {
  const { t } = useLanguage();
  const l = t.operations;
  const c = t.managerCatalog;
  const state = useApi((s) => catalogApi.upcomingBlocks(roomId, s), [roomId]);
  const mutation = useMutation();
  const [editor, setEditor] = useState<{ blockId: string | null } | null>(null);
  const [form, setForm] = useState(empty);
  const [removing, setRemoving] = useState<RoomBlockDto | null>(null);
  const invalidRange = !!form.end && form.end <= form.start;
  const open = (block?: RoomBlockDto) => {
    mutation.reset();
    setEditor({ blockId: block?.blockId ?? null });
    setForm(
      block
        ? {
            start: vietnamLocal(block.startAtUtc),
            end: vietnamLocal(block.endAtUtc),
            reason: block.reason,
          }
        : empty,
    );
  };

  return (
    <section className={styles.blocks} aria-label={c.blockTimes}>
      <AsyncSection state={state}>
        {(rows) => (
          <>
            <div className={styles.heading}>
              <h3>{editor?.blockId ? c.editBlock : c.blockTimes}</h3>
              {rows.length > 0 && !editor && (
                <button type="button" className="btn" onClick={() => open()}>
                  {c.addBlock}
                </button>
              )}
            </div>
            {editor || rows.length === 0 ? (
              <form
                className={styles.form}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (invalidRange || form.reason.trim().length < 3) return;
                  const body = {
                    roomId,
                    startAtUtc: vietnamUtc(form.start),
                    endAtUtc: vietnamUtc(form.end),
                    reason: form.reason.trim(),
                  };
                  if (
                    await mutation.run(() =>
                      editor?.blockId
                        ? api.put(
                            `/api/manager/room-blocks/${editor.blockId}`,
                            body,
                          )
                        : api.post("/api/manager/room-blocks", body),
                    )
                  ) {
                    setEditor(null);
                    setForm(empty);
                    state.reload();
                  }
                }}
              >
                <fieldset disabled={mutation.busy} className={styles.fields}>
                  <div className={styles.dates}>
                    <Field label={l.start} required>
                      <input
                        type="datetime-local"
                        required
                        value={form.start}
                        onChange={(e) =>
                          setForm({ ...form, start: e.target.value })
                        }
                      />
                    </Field>
                    <Field label={l.end} required>
                      <input
                        type="datetime-local"
                        required
                        min={form.start || undefined}
                        value={form.end}
                        aria-invalid={invalidRange || undefined}
                        aria-describedby={
                          invalidRange ? `block-range-${roomId}` : undefined
                        }
                        onChange={(e) =>
                          setForm({ ...form, end: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  {invalidRange && (
                    <p
                      className={styles.error}
                      id={`block-range-${roomId}`}
                      role="alert"
                    >
                      {c.invalidWindow}
                    </p>
                  )}
                  <Field label={l.reason} required>
                    <textarea
                      required
                      minLength={3}
                      maxLength={500}
                      rows={3}
                      value={form.reason}
                      onChange={(e) =>
                        setForm({ ...form, reason: e.target.value })
                      }
                    />
                  </Field>
                  <div className={styles.actions}>
                    <button
                      className="btn"
                      disabled={
                        !form.start ||
                        !form.end ||
                        invalidRange ||
                        form.reason.trim().length < 3
                      }
                    >
                      {mutation.busy
                        ? c.savingBlock
                        : editor?.blockId
                          ? c.saveBlock
                          : c.addBlock}
                    </button>
                    {rows.length > 0 && (
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => {
                          setEditor(null);
                          setForm(empty);
                          mutation.reset();
                        }}
                      >
                        {l.cancel}
                      </button>
                    )}
                  </div>
                </fieldset>
              </form>
            ) : (
              <ul className={styles.list}>
                {rows.map((block) => (
                  <li key={block.blockId} className={styles.block}>
                    <div className={styles.details}>
                      <dl className={styles.dates}>
                        <div>
                          <dt>{l.start}</dt>
                          <dd>
                            <time dateTime={block.startAtUtc}>
                              {formatDateTime(block.startAtUtc)}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt>{l.end}</dt>
                          <dd>
                            <time dateTime={block.endAtUtc}>
                              {formatDateTime(block.endAtUtc)}
                            </time>
                          </dd>
                        </div>
                      </dl>
                      <p className={styles.reason}>{block.reason}</p>
                    </div>
                    <div className={styles.actions}>
                      {block.incidentId ? (
                        <Link
                          className="btn btn--secondary btn--sm"
                          href={`/manager/incidents?roomId=${roomId}&incidentId=${block.incidentId}`}
                        >
                          {l.incidents}
                        </Link>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={mutation.busy}
                            onClick={() => open(block)}
                          >
                            {l.edit}
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            disabled={mutation.busy}
                            onClick={() => {
                              mutation.reset();
                              setRemoving(block);
                            }}
                          >
                            {l.cancel}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </AsyncSection>
      {!removing && <MutationFeedback mutation={mutation} />}
      {removing && (
        <Dialog
          title={c.cancelBlock}
          onClose={() => {
            if (!mutation.busy) setRemoving(null);
          }}
          footer={
            <>
              <button
                className="btn btn--secondary"
                disabled={mutation.busy}
                onClick={() => setRemoving(null)}
              >
                {c.keepBlock}
              </button>
              <button
                className="btn btn--danger"
                disabled={mutation.busy}
                onClick={async () => {
                  if (
                    await mutation.run(() =>
                      api.del(`/api/manager/room-blocks/${removing.blockId}`),
                    )
                  ) {
                    setRemoving(null);
                    state.reload();
                  }
                }}
              >
                {l.confirm}
              </button>
            </>
          }
        >
          <p>{t.managerOperations.deleteBlockReview}</p>
          <p>
            {formatDateTime(removing.startAtUtc)} –{" "}
            {formatDateTime(removing.endAtUtc)}
          </p>
          <p>{removing.reason}</p>
          <MutationFeedback mutation={mutation} />
        </Dialog>
      )}
    </section>
  );
}

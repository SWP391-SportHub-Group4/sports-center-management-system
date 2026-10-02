"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import {
  MutationFeedback,
  Pagination,
  useMutation,
} from "@/features/operations";
import type { ExternalCoachProfileDto, Paged } from "@/lib/types";
import { catalogApi } from "@/features/catalog";
export function ExternalCoachReview() {
  const { t } = useLanguage();
  const l = t.operations;
  const [status, setStatus] = useState("PENDING_APPROVAL");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const mutation = useMutation();
  const state = useApi(
    (s) =>
      api.get<Paged<ExternalCoachProfileDto>>("/api/manager/external-coaches", {
        signal: s,
        query: { status, keyword, page, pageSize: 20 },
      }),
    [status, keyword, page],
  );
  const detail = useApi(
    (s) =>
      selected
        ? api.get<ExternalCoachProfileDto>(
            `/api/manager/external-coaches/${selected}`,
            { signal: s },
          )
        : Promise.resolve(null),
    [selected],
  );
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  return (
    <>
      <div className="form-grid">
        <Field label={l.status}>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{l.all}</option>
            {["PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED"].map(
              (s) => (
                <option key={s} value={s}>
                  {t.wireStatus[s as keyof typeof t.wireStatus]}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label={l.search}>
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      <AsyncSection state={state}>
        {(data) => (
          <>
            <Table headers={[l.fullName, l.email, l.status, ""]}>
              {data.items.map((c) => (
                <tr key={c.userId}>
                  <td>{c.fullName}</td>
                  <td>{c.email}</td>
                  <td>
                    <StatusChip value={c.approvalStatus} />
                  </td>
                  <td>
                    <button
                      className="btn btn--secondary"
                      onClick={() => {
                        setSelected(c.userId);
                        setNote("");
                        mutation.reset();
                      }}
                    >
                      {l.details}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={page}
              count={data.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
      {selected && (
        <Card title={l.details}>
          <AsyncSection state={detail}>
            {(c) => (
              <>
                <p>
                  {c.fullName} · {c.email} · {c.phone}
                </p>
                <p>{c.bio}</p>
                <p>
                  {c.sportIds
                    .map(
                      (id) =>
                        sports.data?.find((s) => s.sportId === id)?.name ?? id,
                    )
                    .join(", ")}
                </p>
                <StatusChip value={c.approvalStatus} />
                <p>{c.reviewNote}</p>
                <Field label={l.reviewNote}>
                  <textarea
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <div className="btn-row">
                  {(c.approvalStatus === "PENDING_APPROVAL"
                    ? ["approve", "reject"]
                    : c.approvalStatus === "APPROVED"
                      ? ["suspend"]
                      : c.approvalStatus === "SUSPENDED"
                        ? ["reactivate"]
                        : []
                  ).map((action) => (
                    <button
                      className="btn"
                      key={action}
                      disabled={
                        mutation.busy ||
                        (["reject", "suspend"].includes(action) && !note.trim())
                      }
                      onClick={async () => {
                        if (
                          await mutation.run(() =>
                            api.post(
                              `/api/manager/external-coaches/${c.userId}/${action}`,
                              { note },
                            ),
                          )
                        ) {
                          state.reload();
                          detail.reload();
                          setNote("");
                        }
                      }}
                    >
                      {
                        l[
                          action as
                            "approve" | "reject" | "suspend" | "reactivate"
                        ]
                      }
                    </button>
                  ))}
                </div>
              </>
            )}
          </AsyncSection>
          <MutationFeedback mutation={mutation} />
        </Card>
      )}
    </>
  );
}

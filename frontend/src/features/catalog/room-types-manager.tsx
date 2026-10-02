"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Card, Field, Table } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { SpecialtyEditor } from "@/features/coaches";
import { catalogApi } from "./api";
export function RoomTypesManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi((s) => catalogApi.roomTypes(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const mutation = useMutation();
  const [id, setId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [sportIds, setSports] = useState<number[]>([]);
  return (
    <>
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            let target = id;
            if (
              await mutation.run(async () => {
                if (target)
                  await api.put(`/api/manager/room-types/${target}`, { name });
                else {
                  const created = await api.post<{ roomTypeId: number }>(
                    "/api/manager/room-types",
                    { name },
                  );
                  target = created.roomTypeId;
                  setId(target);
                }
                await api.put(`/api/manager/room-types/${target}/sports`, {
                  sportIds,
                });
              })
            ) {
              state.reload();
              setId(null);
              setName("");
              setSports([]);
            }
          }}
        >
          <Field label={l.name}>
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <AsyncSection state={sports}>
            {(rows) => (
              <SpecialtyEditor
                sports={rows}
                value={sportIds}
                onChange={setSports}
              />
            )}
          </AsyncSection>
          <div className="btn-row">
            <button className="btn" disabled={mutation.busy}>
              {id ? l.save : l.create}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setId(null);
                setName("");
                setSports([]);
              }}
            >
              {id ? l.cancel : l.resetForm}
            </button>
          </div>
        </form>
        <MutationFeedback mutation={mutation} />
      </Card>
      <AsyncSection state={state}>
        {(rows) => (
          <Table headers={[l.roomType, l.sports, ""]}>
            {rows.map((r) => (
              <tr key={r.roomTypeId}>
                <td>{r.name}</td>
                <td>
                  {r.sportIds
                    .map(
                      (id) =>
                        sports.data?.find((s) => s.sportId === id)?.name ?? id,
                    )
                    .join(", ")}
                </td>
                <td>
                  <button
                    className="btn btn--secondary"
                    onClick={() => {
                      setId(r.roomTypeId);
                      setName(r.name);
                      setSports(r.sportIds);
                    }}
                  >
                    {l.edit}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AsyncSection>
    </>
  );
}

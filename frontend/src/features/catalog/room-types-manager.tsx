"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Dialog, Field, Table } from "@/components/ui";
import { FilterBar } from "@/components/data";
import { useUrlQuery } from "@/lib/useUrlQuery";
import { MutationFeedback, useMutation } from "@/features/operations";
import { SpecialtyEditor } from "@/features/coaches";
import { catalogApi } from "./api";
import styles from "./manager-catalog.module.css";
export function RoomTypesManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi((s) => catalogApi.roomTypes(s), []);
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const mutation = useMutation();
  const [id, setId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [sportIds, setSports] = useState<number[]>([]);
  const [editing, setEditing] = useState(false);
  const [partial, setPartial] = useState(false);
  const { values, setValues } = useUrlQuery({ q: "" });
  return (
    <>
      <FilterBar
        fields={[{ id: "q", label: l.search, kind: "search" }]}
        values={values}
        onChange={setValues}
        onReset={() => setValues({ q: "" })}
        actions={
          <button
            className="btn"
            onClick={() => {
              setId(null);
              setName("");
              setSports([]);
              setPartial(false);
              setEditing(true);
              mutation.reset();
            }}
          >
            {l.create}
          </button>
        }
      />
      {editing && (
        <Dialog
          title={id ? l.edit : l.create}
          size="lg"
          onClose={() => {
            if (!mutation.busy) setEditing(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              let target = id;
              if (
                await mutation.run(async () => {
                  if (target)
                    await api.put(`/api/manager/room-types/${target}`, {
                      name,
                    });
                  else {
                    const created = await api.post<{ roomTypeId: number }>(
                      "/api/manager/room-types",
                      { name },
                    );
                    target = created.roomTypeId;
                    setId(target);
                    setPartial(true);
                    state.reload();
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
                setEditing(false);
                setPartial(false);
              }
            }}
          >
            <fieldset
              className={`${styles.formFields} ${styles.roomTypeFields}`}
              disabled={mutation.busy}
            >
              <Field label={l.name}>
                <input
                  required
                  maxLength={100}
                  pattern=".*\S.*"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <AsyncSection state={sports}>
                {(rows) => (
                  <SpecialtyEditor
                    legend={l.sports}
                    sports={id ? rows : rows.filter((sport) => sport.isActive)}
                    value={sportIds}
                    onChange={setSports}
                  />
                )}
              </AsyncSection>
              <div className="btn-row">
                <button
                  className="btn"
                  disabled={
                    mutation.busy ||
                    !name.trim() ||
                    sports.loading ||
                    !!sports.error
                  }
                >
                  {id ? l.save : l.create}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={mutation.busy}
                  onClick={() => {
                    setId(null);
                    setName("");
                    setSports([]);
                    setEditing(false);
                  }}
                >
                  {id ? l.cancel : l.resetForm}
                </button>
              </div>
            </fieldset>
          </form>
          <MutationFeedback mutation={mutation} />
          {partial && (
            <p role="status">
              {t.managerOperations.completedStep} · {name}.{" "}
              {t.managerOperations.partialHint}
            </p>
          )}
        </Dialog>
      )}
      <AsyncSection state={state}>
        {(rows) => (
          <Table headers={[l.roomType, l.sports, ""]}>
            {rows
              .filter((r) =>
                r.name
                  .toLocaleLowerCase()
                  .includes(values.q.trim().toLocaleLowerCase()),
              )
              .map((r) => (
                <tr key={r.roomTypeId}>
                  <td>{r.name}</td>
                  <td>
                    {r.sportIds
                      .map(
                        (id) =>
                          sports.data?.find((s) => s.sportId === id)?.name ??
                          id,
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
                        setEditing(true);
                        setPartial(false);
                        mutation.reset();
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

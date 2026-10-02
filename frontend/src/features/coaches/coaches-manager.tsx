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
import { PasswordRequirements, passwordChecks } from "@/features/identity";
import { SpecialtyEditor } from "./specialty-editor";
import { catalogApi } from "@/features/catalog";
import type { CoachAdminDto, Paged } from "@/lib/types";
export function CoachesManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [sportId, setSport] = useState("");
  const state = useApi(
    (s) =>
      api.get<Paged<CoachAdminDto>>("/api/manager/coaches", {
        signal: s,
        query: { page, pageSize: 20, keyword, sportId },
      }),
    [page, keyword, sportId],
  );
  const sports = useApi((s) => catalogApi.sports(s, true), []);
  const mutation = useMutation();
  const empty = {
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    phone: "",
    bio: "",
    sportIds: [] as number[],
  };
  const [form, setForm] = useState(empty);
  const [id, setId] = useState<string | null>(null);
  const valid =
    form.sportIds.length > 0 &&
    (id ||
      (passwordChecks(form.password, form.email).every(Boolean) &&
        form.password === form.confirmPassword));
  return (
    <>
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            if (
              await mutation.run(() =>
                id
                  ? api.put(`/api/manager/coaches/${id}`, {
                      fullName: form.fullName,
                      phone: form.phone,
                      bio: form.bio,
                      sportIds: form.sportIds,
                    })
                  : api.post("/api/manager/coaches", {
                      email: form.email,
                      password: form.password,
                      fullName: form.fullName,
                      phone: form.phone || null,
                      bio: form.bio,
                      sportIds: form.sportIds,
                    }),
              )
            ) {
              state.reload();
              setId(null);
              setForm(empty);
            }
          }}
        >
          {!id && (
            <>
              <div className="form-grid">
                <Field label={l.email}>
                  <input
                    required
                    type="email"
                    autoComplete="off"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                  />
                </Field>
                <Field label={l.fullName}>
                  <input
                    required
                    value={form.fullName}
                    onChange={(e) =>
                      setForm({ ...form, fullName: e.target.value })
                    }
                  />
                </Field>
                <Field label={l.phone}>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                  />
                </Field>
                <Field label={l.password}>
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    maxLength={64}
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                  />
                </Field>
                <Field label={l.confirmPassword}>
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(e) =>
                      setForm({ ...form, confirmPassword: e.target.value })
                    }
                  />
                </Field>
              </div>
              <PasswordRequirements
                password={form.password}
                email={form.email}
              />
            </>
          )}
          {id && (
            <div className="form-grid">
              <p>{form.email}</p>
              <Field label={l.fullName}>
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={form.fullName}
                  onChange={(e) =>
                    setForm({ ...form, fullName: e.target.value })
                  }
                />
              </Field>
              <Field label={l.phone}>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
            </div>
          )}
          <Field label={l.bio}>
            <textarea
              maxLength={1000}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </Field>
          <AsyncSection state={sports}>
            {(rows) => (
              <SpecialtyEditor
                sports={rows}
                value={form.sportIds}
                onChange={(sportIds) => setForm({ ...form, sportIds })}
              />
            )}
          </AsyncSection>
          {id && <p className="alert alert--info">{l.specialtyWarning}</p>}
          <div className="btn-row">
            <button className="btn" disabled={mutation.busy || !valid}>
              {id ? l.save : l.create}
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => {
                setId(null);
                setForm(empty);
              }}
            >
              {id ? l.cancel : l.resetForm}
            </button>
          </div>
        </form>
        <MutationFeedback mutation={mutation} />
      </Card>
      <div className="form-grid">
        <Field label={l.search}>
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label={l.sport}>
          <select
            value={sportId}
            onChange={(e) => {
              setSport(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{l.all}</option>
            {sports.data?.map((s) => (
              <option key={s.sportId} value={s.sportId}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <AsyncSection state={state}>
        {(data) => (
          <>
            <Table headers={[l.fullName, l.email, l.specialties, l.status, ""]}>
              {data.items.map((c) => (
                <tr key={c.userId}>
                  <td>{c.fullName}</td>
                  <td>{c.email}</td>
                  <td>
                    {c.sportIds
                      .map(
                        (id) =>
                          sports.data?.find((s) => s.sportId === id)?.name ??
                          id,
                      )
                      .join(", ")}
                  </td>
                  <td>
                    <StatusChip value={c.status} />
                  </td>
                  <td>
                    <button
                      className="btn btn--secondary"
                      onClick={() => {
                        setId(c.userId);
                        setForm({
                          ...empty,
                          ...c,
                          bio: c.bio ?? "",
                          phone: c.phone ?? "",
                        });
                      }}
                    >
                      {l.edit}
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
    </>
  );
}

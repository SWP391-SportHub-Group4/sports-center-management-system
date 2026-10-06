"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { SportDto, SportServiceType } from "@/lib/types";
import { catalogApi } from "./api";

const SERVICE_TYPES: SportServiceType[] = [
  "MEMBERSHIP_ACCESS",
  "GROUP_COURSE",
  "COURT_RENTAL",
  "PERSONAL_TRAINING",
];

/** Membership và PT chỉ thuộc môn Gym; backend chặn, form chỉ ẩn lựa chọn cho khỏi nhầm. */
const GYM_ONLY: SportServiceType[] = ["MEMBERSHIP_ACCESS", "PERSONAL_TRAINING"];
const GYM_CODE = "gym";

interface FormState {
  code: string;
  name: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  enabled: Record<SportServiceType, boolean>;
  defaultSessionMinutes: number;
  defaultMaxCapacity: number;
}

const EMPTY: FormState = {
  code: "",
  name: "",
  description: "",
  imageUrl: "",
  sortOrder: 0,
  enabled: {
    MEMBERSHIP_ACCESS: false,
    GROUP_COURSE: true,
    COURT_RENTAL: false,
    PERSONAL_TRAINING: false,
  },
  defaultSessionMinutes: 90,
  defaultMaxCapacity: 12,
};

export function SportsManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const state = useApi((s) => catalogApi.sports(s, true), []);
  const mutation = useMutation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [id, setId] = useState<number | null>(null);

  const serviceLabel: Record<SportServiceType, string> = {
    MEMBERSHIP_ACCESS: l.serviceMembershipAccess,
    GROUP_COURSE: l.serviceGroupCourse,
    COURT_RENTAL: l.serviceCourtRental,
    PERSONAL_TRAINING: l.servicePersonalTraining,
  };
  const missingLabel: Record<string, string> = {
    room_type: l.missingRoomType,
    room: l.missingRoom,
    opening_hours: l.missingOpeningHours,
    court_rate: l.missingCourtRate,
  };

  const isGym = (form.code || "").toLowerCase() === GYM_CODE;
  const visibleServices = SERVICE_TYPES.filter(
    (type) => isGym || !GYM_ONLY.includes(type),
  );

  const reset = () => {
    setId(null);
    setForm(EMPTY);
  };

  return (
    <>
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const services = visibleServices
              .filter((type) => form.enabled[type])
              .map((serviceType) => ({
                serviceType,
                isEnabled: true,
                defaultSessionMinutes:
                  serviceType === "GROUP_COURSE"
                    ? form.defaultSessionMinutes
                    : null,
                defaultMaxCapacity:
                  serviceType === "GROUP_COURSE"
                    ? form.defaultMaxCapacity
                    : null,
              }));
            const body = {
              ...(id === null ? { code: form.code.trim().toLowerCase() } : {}),
              name: form.name,
              description: form.description,
              imageUrl: form.imageUrl,
              sortOrder: form.sortOrder,
              services,
            };
            if (
              await mutation.run(() =>
                id
                  ? api.put(`/api/manager/sports/${id}`, body)
                  : api.post("/api/manager/sports", body),
              )
            ) {
              state.reload();
              reset();
            }
          }}
        >
          <div className="form-grid">
            <Field label={l.code}>
              <input
                required={id === null}
                disabled={id !== null}
                maxLength={32}
                pattern="[a-z0-9_]{2,32}"
                title={l.codeHint}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label={l.name}>
              <input
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={l.sortOrder}>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm({ ...form, sortOrder: Number(e.target.value) })
                }
              />
            </Field>
            <Field label={l.image}>
              <input
                maxLength={500}
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
            </Field>
          </div>
          <fieldset>
            <legend>{l.services}</legend>
            {visibleServices.map((type) => (
              <label key={type}>
                <input
                  type="checkbox"
                  checked={form.enabled[type]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      enabled: { ...form.enabled, [type]: e.target.checked },
                    })
                  }
                />{" "}
                {serviceLabel[type]}
              </label>
            ))}
            {!isGym && <p className="muted">{l.serviceNote}</p>}
          </fieldset>
          {form.enabled.GROUP_COURSE && (
            <div className="form-grid">
              <Field label={l.duration}>
                <input
                  required
                  type="number"
                  min={15}
                  max={480}
                  value={form.defaultSessionMinutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultSessionMinutes: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label={l.capacity}>
                <input
                  required
                  type="number"
                  min={1}
                  max={500}
                  value={form.defaultMaxCapacity}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultMaxCapacity: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          )}
          <Field label={l.description}>
            <textarea
              maxLength={2000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
          <div className="btn-row">
            <button className="btn" disabled={mutation.busy}>
              {id ? l.save : l.create}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={reset}
            >
              {id ? l.cancel : l.resetForm}
            </button>
          </div>
        </form>
        <MutationFeedback mutation={mutation} />
      </Card>
      <AsyncSection state={state}>
        {(rows) => (
          <Table headers={[l.name, l.services, l.status, ""]}>
            {rows.map((s) => (
              <tr key={s.sportId}>
                <td>{s.name}</td>
                <td>
                  <ServiceList
                    sport={s}
                    serviceLabel={serviceLabel}
                    missingLabel={missingLabel}
                    notReady={l.notReady}
                    missingPrefix={l.missingPrefix}
                    off={l.serviceOff}
                  />
                </td>
                <td>
                  <StatusChip value={s.isActive ? "ACTIVE" : "INACTIVE"} />
                </td>
                <td>
                  <button
                    className="btn btn--secondary"
                    onClick={() => {
                      const group = s.services.find(
                        (x) => x.serviceType === "GROUP_COURSE",
                      );
                      setId(s.sportId);
                      setForm({
                        code: s.code,
                        name: s.name,
                        description: s.description ?? "",
                        imageUrl: s.imageUrl ?? "",
                        sortOrder: s.sortOrder,
                        enabled: Object.fromEntries(
                          SERVICE_TYPES.map((type) => [
                            type,
                            s.services.some(
                              (x) => x.serviceType === type && x.isEnabled,
                            ),
                          ]),
                        ) as FormState["enabled"],
                        defaultSessionMinutes:
                          group?.defaultSessionMinutes ?? 90,
                        defaultMaxCapacity: group?.defaultMaxCapacity ?? 12,
                      });
                    }}
                  >
                    {l.edit}
                  </button>
                  <button
                    className="btn btn--ghost"
                    disabled={mutation.busy}
                    onClick={async () => {
                      if (
                        await mutation.run(() =>
                          api.post(
                            `/api/manager/sports/${s.sportId}/${s.isActive ? "deactivate" : "activate"}`,
                          ),
                        )
                      )
                        state.reload();
                    }}
                  >
                    {s.isActive ? l.deactivate : l.activate}
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

function ServiceList({
  sport,
  serviceLabel,
  missingLabel,
  notReady,
  missingPrefix,
  off,
}: {
  sport: SportDto;
  serviceLabel: Record<SportServiceType, string>;
  missingLabel: Record<string, string>;
  notReady: string;
  missingPrefix: string;
  off: string;
}) {
  return (
    <ul>
      {sport.services.map((svc) => {
        const readiness = sport.readiness?.find(
          (r) => r.serviceType === svc.serviceType,
        );
        return (
          <li key={svc.serviceType}>
            {serviceLabel[svc.serviceType]}
            {!svc.isEnabled && <span className="muted"> ({off})</span>}
            {svc.isEnabled && readiness && !readiness.ready && (
              <span className="muted">
                {" "}
                ({notReady}. {missingPrefix}{" "}
                {readiness.missing.map((m) => missingLabel[m] ?? m).join(", ")})
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

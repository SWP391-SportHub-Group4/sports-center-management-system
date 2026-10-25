"use client";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";
import { validLandingImage } from "@/components/homepage/landing-content-context";
import {
  SportImageEditor,
  type SportImageEditorHandle,
} from "./sport-image-editor";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { Field, StatusChip } from "@/components/ui";
import { useMutation } from "@/features/operations";
import type { SportDto, SportServiceType } from "@/lib/types";
import { catalogApi, type SaveSport } from "./api";
import {
  CatalogPanel,
  CatalogFeedback,
  CatalogFilters,
  CatalogFormDialog,
  CatalogTable,
  matchesCatalog,
  useCatalogFilters,
} from "./manager-shared";
import styles from "./manager-catalog.module.css";

const SERVICE_TYPES: SportServiceType[] = [
  "MEMBERSHIP_ACCESS",
  "GROUP_COURSE",
  "COURT_RENTAL",
];
const GYM_ONLY: SportServiceType[] = ["MEMBERSHIP_ACCESS"];
interface FormState {
  isActive: boolean;
  code: string;
  name: string;
  description: string;
  imageUrl: string;
  enabled: Record<SportServiceType, boolean>;
  defaultSessionMinutes: number;
  defaultMaxCapacity: number;
}
const empty: FormState = {
  isActive: true,
  code: "",
  name: "",
  enabled: {
    MEMBERSHIP_ACCESS: false,
    GROUP_COURSE: true,
    COURT_RENTAL: false,
  },
  defaultSessionMinutes: 90,
  defaultMaxCapacity: 12,
  description: "",
  imageUrl: "",
};
export function SportsManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const c = t.managerCatalog;
  const state = useApi((s) => catalogApi.sports(s, true), []);
  const filters = useCatalogFilters();
  const mutation = useMutation();
  const imageEditor = useRef<SportImageEditorHandle>(null);
  const imageUpload = useRef<{ blob: Blob; url: string } | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [form, setForm] = useState(empty);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const serviceLabel: Record<SportServiceType, string> = {
    MEMBERSHIP_ACCESS: l.serviceMembershipAccess,
    GROUP_COURSE: l.serviceGroupCourse,
    COURT_RENTAL: l.serviceCourtRental,
  };
  const missingLabel: Record<string, string> = {
    room_type: l.missingRoomType,
    room: l.missingRoom,
    opening_hours: l.missingOpeningHours,
    court_rate: l.missingCourtRate,
  };
  const isGym = form.code.trim().toLowerCase() === "gym";
  const visibleServices = SERVICE_TYPES.filter(
    (type) => isGym || !GYM_ONLY.includes(type),
  );
  const edit = (row?: SportDto) => {
    imageUpload.current = null;
    mutation.reset();
    setEditor({ id: row?.sportId ?? null });
    const group = row?.services.find((s) => s.serviceType === "GROUP_COURSE");
    setForm(
      row
        ? {
            isActive: row.isActive,
            name: row.name,
            code: row.code,
            enabled: Object.fromEntries(
              SERVICE_TYPES.map((type) => [
                type,
                row.services.some((s) => s.serviceType === type && s.isEnabled),
              ]),
            ) as FormState["enabled"],
            defaultSessionMinutes: group?.defaultSessionMinutes ?? 90,
            defaultMaxCapacity: group?.defaultMaxCapacity ?? 12,
            description: row.description ?? "",
            imageUrl: row.imageUrl ?? "",
          }
        : empty,
    );
  };
  return (
    <>
      <CatalogPanel
        filters={
          <CatalogFilters
            filters={filters}
            extra={[
              {
                id: "service",
                label: l.services,
                kind: "select",
                options: [
                  { value: "", label: l.all },
                  ...SERVICE_TYPES.map((type) => ({
                    value: type,
                    label: serviceLabel[type],
                  })),
                ],
              },
            ]}
          />
        }
        actions={
          <button
            className="btn"
            disabled={state.loading || !!state.error}
            onClick={() => edit()}
          >
            {c.createSport}
          </button>
        }
      >
        <CatalogTable
          className={styles.sportsTable}
          state={state}
          filters={filters}
          caption={l.sports}
          rows={(state.data ?? []).filter(
            (s) =>
              matchesCatalog(s, `${s.code} ${s.name}`, filters.values) &&
              (!filters.values.service ||
                s.services.some(
                  (service) =>
                    service.isEnabled &&
                    service.serviceType === filters.values.service,
                )),
          )}
          getRowId={(s) => String(s.sportId)}
          columns={[
            { id: "sortOrder", header: c.ordinal, numeric: true },
            { id: "name", header: l.name, rowHeader: true },
            {
              id: "code",
              header: l.code,
              cell: (s) => <span className={styles.sportCode}>{s.code}</span>,
            },
            {
              id: "services",
              header: l.services,
              cell: (s) => (
                <ul className={styles.serviceList}>
                  {s.services.map((svc) => {
                    const readiness = s.readiness?.find(
                      (r) => r.serviceType === svc.serviceType,
                    );
                    return (
                      <li key={svc.serviceType}>
                        <span className={styles.serviceName}>
                          {serviceLabel[svc.serviceType]}
                          {!svc.isEnabled && (
                            <span className="muted"> ({l.serviceOff})</span>
                          )}
                        </span>
                        {svc.serviceType === "GROUP_COURSE" && (
                          <span className={styles.serviceDetail}>
                            {svc.defaultSessionMinutes} {c.minutes} ·{" "}
                            {svc.defaultMaxCapacity} {c.people}
                          </span>
                        )}
                        {svc.isEnabled && readiness && !readiness.ready && (
                          <span className={styles.serviceDetail}>
                            {l.notReady}. {l.missingPrefix}{" "}
                            {readiness.missing
                              .map((m) => missingLabel[m] ?? m)
                              .join(", ")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ),
            },
            {
              id: "isActive",
              header: l.status,
              cell: (s) => (
                <StatusChip value={s.isActive ? "ACTIVE" : "INACTIVE"} />
              ),
            },
          ]}
          actions={(s) => (
            <>
              <button
                className="btn btn--secondary btn--sm"
                disabled={mutation.busy}
                onClick={() => edit(s)}
              >
                {l.edit}
              </button>
            </>
          )}
        />
        {!editor && <CatalogFeedback mutation={mutation} />}
      </CatalogPanel>
      {editor && (
        <CatalogFormDialog
          title={editor.id === null ? c.createSport : c.editSport}
          busy={mutation.busy}
          canSubmit={!preparingImage}
          mutation={mutation}
          onClose={() => setEditor(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            if (preparingImage) return;
            const body: SaveSport = {
              ...(editor.id === null
                ? { code: form.code.trim().toLowerCase() }
                : {}),
              isActive: form.isActive,
              name: form.name.trim(),
              description: form.description,
              imageUrl: form.imageUrl,
              services: visibleServices
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
                })),
            };
            if (
              await mutation.run(async () => {
                const blob = await imageEditor.current?.exportImage();
                if (blob) {
                  if (imageUpload.current?.blob !== blob) {
                    const upload = new FormData();
                    upload.append("file", blob, "sport-landing-image.jpg");
                    upload.append("preset", "landscape");
                    const result = await api.postForm<{ url: string }>(
                      "/api/manager/media/images",
                      upload,
                    );
                    if (
                      typeof result.url !== "string" ||
                      !validLandingImage(result.url)
                    )
                      throw new ApiError(
                        0,
                        "image_upload_failed",
                        c.imageUploadFailed,
                      );
                    imageUpload.current = { blob, url: result.url };
                  }
                  body.imageUrl = imageUpload.current.url;
                }
                return catalogApi.saveSport(editor.id, body);
              })
            ) {
              setEditor(null);
              state.reload();
            }
          }}
        >
          {editor.id !== null && (
            <ActivitySwitch
              checked={form.isActive ?? true}
              onChange={(isActive) => setForm({ ...form, isActive })}
            />
          )}
          <div className="form-grid">
            <Field
              label={l.code}
              required={editor.id === null}
              hint={l.codeHint}
            >
              <input
                required={editor.id === null}
                disabled={editor.id !== null}
                maxLength={32}
                pattern="[a-z0-9_]{2,32}"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label={l.name} required>
              <input
                required
                pattern=".*\S.*"
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            {form.enabled.GROUP_COURSE && (
              <>
                <Field label={l.duration} required>
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
                <Field label={l.capacity} required>
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
              </>
            )}
          </div>
          <SportImageEditor
            ref={imageEditor}
            value={form.imageUrl}
            disabled={mutation.busy}
            onPreparingChange={setPreparingImage}
          />
          <fieldset className={styles.days}>
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
                />
                {serviceLabel[type]}
              </label>
            ))}
          </fieldset>
          {!isGym && <p className="small muted">{l.serviceNote}</p>}
          <Field label={l.description}>
            <textarea
              maxLength={2000}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
        </CatalogFormDialog>
      )}
    </>
  );
}

"use client";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";
import { validLandingImage } from "@/components/homepage/landing-content-context";
import {
  SportImageEditor,
  type SportImageEditorHandle,
} from "./sport-image-editor";
import { useLanguage } from "@/lib/language";
import { Field } from "@/components/ui";
import { useMutation } from "@/features/operations";
import type { SportDto } from "@/lib/types";
import { catalogApi, type SaveSport } from "./api";
import { CatalogFormDialog } from "./manager-shared";
import { SportDeactivationDialog } from "./sport-deactivation-dialog";

interface FormState {
  isActive: boolean;
  code: string;
  name: string;
  description: string;
  imageUrl: string;
  services: SaveSport["services"];
}
const empty: FormState = {
  isActive: true,
  code: "",
  name: "",
  services: [
    {
      serviceType: "GROUP_COURSE",
      isEnabled: true,
      defaultSessionMinutes: 90,
      defaultMaxCapacity: 12,
    },
  ],
  description: "",
  imageUrl: "",
};
export function SportEditor({
  row,
  onClose,
  onSaved,
}: {
  row?: SportDto;
  onClose: () => void;
  onSaved: (sport: SportDto) => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const c = t.managerCatalog;
  const mutation = useMutation();
  const imageEditor = useRef<SportImageEditorHandle>(null);
  const imageUpload = useRef<{ blob: Blob; url: string } | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [confirmDeactivation, setConfirmDeactivation] = useState(false);
  const [form, setForm] = useState<FormState>(
    row
      ? {
          isActive: row.isActive,
          code: row.code,
          name: row.name,
          description: row.description ?? "",
          imageUrl: row.imageUrl ?? "",
          services: row.services,
        }
      : empty,
  );
  const editor = { id: row?.sportId ?? null };
  const codeError =
    mutation.error?.code === "sport_code_taken"
      ? c.duplicateSportCode
      : undefined;
  const nameError =
    mutation.error?.code === "sport_name_taken" ? c.duplicateName : undefined;
  return (
    <>
      <CatalogFormDialog
        title={editor.id === null ? c.createSport : c.editSport}
        busy={mutation.busy}
        canSubmit={!preparingImage}
        mutation={{
          ...mutation,
          error: codeError || nameError ? null : mutation.error,
        }}
        onClose={() => {
          mutation.reset();
          onClose();
        }}
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
            services: form.services,
          };
          let saved: SportDto | undefined;
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
              saved = await catalogApi.saveSport(editor.id, body);
            })
          ) {
            if (saved) onSaved(saved);
          }
        }}
      >
        {editor.id !== null && (
          <ActivitySwitch
            checked={form.isActive ?? true}
            hint="Turn off to deactivate this sport and cancel its related classes, including classes with enrolled students."
            onChange={(isActive) => {
              if (!isActive && row?.isActive) setConfirmDeactivation(true);
              else setForm({ ...form, isActive });
            }}
          />
        )}
        <div className="form-grid">
          <Field
            label={l.code}
            required={editor.id === null}
            hint={l.codeHint}
            error={codeError}
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
          <Field label={l.name} required error={nameError}>
            <input
              required
              pattern=".*\S.*"
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
        </div>
        <SportImageEditor
          ref={imageEditor}
          value={form.imageUrl}
          disabled={mutation.busy}
          onPreparingChange={setPreparingImage}
        />
        <Field label={l.description}>
          <textarea
            maxLength={2000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      </CatalogFormDialog>
      {confirmDeactivation && row && (
        <SportDeactivationDialog
          sport={row}
          onClose={() => setConfirmDeactivation(false)}
          onConfirmed={onSaved}
        />
      )}
    </>
  );
}

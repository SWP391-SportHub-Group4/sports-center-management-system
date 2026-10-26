"use client";

import { useId, useState } from "react";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { Dialog, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import type { RoomDto } from "@/lib/types";
import styles from "./room-details.module.css";

export function RoomEditDialog({
  room,
  onClose,
  onSaved,
}: {
  room: RoomDto;
  onClose: () => void;
  onSaved: (room: RoomDto) => void;
}) {
  const { t } = useLanguage();
  const copy = t.managerCatalog;
  const formId = useId();
  const [name, setName] = useState(room.name);
  const [capacity, setCapacity] = useState(String(room.capacity));
  const [active, setActive] = useState(room.isActive);
  const [touched, setTouched] = useState({ name: false, capacity: false });
  const mutation = useMutation();
  const validName = name.trim().length > 0 && name.trim().length <= 100;
  const validCapacity =
    capacity.trim() !== "" &&
    Number.isInteger(Number(capacity)) &&
    Number(capacity) >= 1 &&
    Number(capacity) <= 500;
  const changed =
    name.trim() !== room.name ||
    Number(capacity) !== room.capacity ||
    active !== room.isActive;
  const nameError =
    mutation.error?.code === "room_name_taken"
      ? copy.duplicateName
      : touched.name && !validName
        ? copy.roomNameRequired
        : undefined;
  const capacityError =
    touched.capacity && !validCapacity ? copy.roomCapacityRange : undefined;

  return (
    <Dialog
      title={copy.editCourt}
      description={copy.roomEditDescription}
      size="md"
      closeIconOnly
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {t.operations.cancel}
          </button>
          <button
            type="submit"
            form={formId}
            className="btn"
            disabled={mutation.busy || !changed || !validName || !validCapacity}
          >
            {mutation.busy ? t.common.loading : copy.roomSaveChanges}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className={styles.editForm}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!changed || !validName || !validCapacity || mutation.busy) return;
          let updated: RoomDto | undefined;
          if (
            (await mutation.run(async () => {
              updated = await api.put<RoomDto>(`/api/rooms/${room.roomId}`, {
                name: name.trim(),
                capacity: Number(capacity),
                isActive: active,
              });
            })) &&
            updated
          )
            onSaved(updated);
        }}
      >
        <fieldset disabled={mutation.busy} className={styles.editFields}>
          <legend className="sr-only">{copy.editCourt}</legend>
          <Field label={t.operations.name} required error={nameError}>
            <input
              autoFocus
              required
              maxLength={100}
              pattern=".*\S.*"
              value={name}
              onBlur={() =>
                setTouched((previous) => ({ ...previous, name: true }))
              }
              onChange={(event) => {
                setName(event.target.value);
                setTouched((previous) => ({ ...previous, name: true }));
                mutation.reset();
              }}
            />
          </Field>
          <div className={styles.capacityControl}>
            <Field
              label={t.operations.capacity}
              required
              error={capacityError}
              hint={copy.roomCapacityHint}
            >
              <input
                type="number"
                required
                min={1}
                max={500}
                step={1}
                value={capacity}
                onBlur={() =>
                  setTouched((previous) => ({ ...previous, capacity: true }))
                }
                onChange={(event) => {
                  setCapacity(event.target.value);
                  setTouched((previous) => ({ ...previous, capacity: true }));
                  mutation.reset();
                }}
              />
            </Field>
            <span className={styles.capacityUnit}>{copy.capacityPeople}</span>
          </div>
          <div className={styles.availability}>
            <ActivitySwitch
              label={t.operations.active}
              hint={copy.roomActiveHint}
              checked={active}
              onChange={(value) => {
                setActive(value);
                mutation.reset();
              }}
            />
          </div>
        </fieldset>
        {mutation.error?.code !== "room_name_taken" && (
          <MutationFeedback mutation={mutation} />
        )}
      </form>
    </Dialog>
  );
}

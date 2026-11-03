"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection } from "@/components/ui";
import { useMutation } from "@/features/operations";
import { catalogApi } from "@/features/catalog";
import { CatalogFormDialog } from "@/features/catalog";
import { SpecialtyEditor } from "./specialty-editor";
import type { CoachAdminDto } from "@/lib/types";
export function CoachEditor({
  coach,
  onClose,
  onSaved,
}: {
  coach: CoachAdminDto;
  onClose: () => void;
  onSaved: (saved: CoachAdminDto) => void;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const mutation = useMutation();
  const [sportIds, setSportIds] = useState(coach.sportIds);
  const sports = useApi((signal) => catalogApi.sports(signal, true), []);
  const valid = sportIds.length > 0;
  return (
    <CatalogFormDialog
      title={`${l.edit} ${l.coach.toLocaleLowerCase()}`}
      busy={mutation.busy}
      canSubmit={valid}
      mutation={mutation}
      onClose={onClose}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        let saved: CoachAdminDto | undefined;
        if (
          await mutation.run(async () => {
            saved = await api.put<CoachAdminDto>(
              `/api/manager/coaches/${coach.userId}`,
              { sportIds },
            );
          })
        )
          onSaved(saved!);
      }}
    >
      <AsyncSection state={sports}>
        {(rows) => (
          <SpecialtyEditor
            sports={rows.filter(
              (s) => s.isActive || sportIds.includes(s.sportId),
            )}
            value={sportIds}
            onChange={setSportIds}
          />
        )}
      </AsyncSection>
      {!sportIds.length && <p role="alert">{l.specialties}</p>}
      <p className="alert alert--info">{l.specialtyWarning}</p>
    </CatalogFormDialog>
  );
}

"use client";
import { PackageMembers } from "./package-members";
import { DAY_PASS_PACKAGE_ID } from "@/lib/day-pass";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import type { MembershipPackageDto } from "@/lib/types";
import { Field, StatusChip } from "@/components/ui";
import { useMutation } from "@/features/operations";
import { catalogApi, type SavePackage } from "./api";
import {
  CatalogPanel,
  CatalogFeedback,
  CatalogFilters,
  CatalogFormDialog,
  CatalogTable,
  matchesCatalog,
  useCatalogFilters,
} from "./manager-shared";
const empty: Omit<SavePackage, "price"> & { price: number | "" } = {
  isActive: true,
  name: "",
  price: "",
  durationDays: 30,
  description: "",
  sessionLimit: null,
};
export function MembershipManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const c = t.managerCatalog;
  const state = useApi((s) => catalogApi.packages(s), []);
  const filters = useCatalogFilters();
  const mutation = useMutation();
  const [form, setForm] = useState(empty);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const [buyers, setBuyers] = useState<MembershipPackageDto | null>(null);
  const edit = (p?: MembershipPackageDto) => {
    mutation.reset();
    setEditor({ id: p?.packageId ?? null });
    setForm(
      p
        ? {
            isActive: p.isActive,
            name: p.name,
            price: p.price,
            durationDays: p.durationDays,
            description: p.description ?? "",
            sessionLimit: null,
          }
        : empty,
    );
  };
  return (
    <>
      {buyers && (
        <PackageMembers plan={buyers} onClose={() => setBuyers(null)} />
      )}
      <CatalogPanel
        filters={<CatalogFilters filters={filters} />}
        actions={
          <button
            className="btn"
            disabled={state.loading || !!state.error}
            onClick={() => edit()}
          >
            {c.createPackage}
          </button>
        }
      >
        <CatalogTable
          state={state}
          visibleRowActions={3}
          filters={filters}
          caption={c.gymPackages}
          rows={(state.data ?? []).filter((p) =>
            matchesCatalog(p, p.name, filters.values),
          )}
          getRowId={(p) => String(p.packageId)}
          columns={[
            { id: "name", header: l.name, rowHeader: true },
            {
              id: "price",
              header: l.price,
              numeric: true,
              cell: (p) => formatMoney(p.price),
            },
            { id: "durationDays", header: c.durationDays, numeric: true },
            {
              id: "isActive",
              header: l.status,
              cell: (p) => (
                <StatusChip value={p.isActive ? "ACTIVE" : "INACTIVE"} />
              ),
            },
          ]}
          actions={(p) => (
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setBuyers(p)}
              >
                View members
              </button>
              <button
                className="btn btn--secondary btn--sm"
                disabled={mutation.busy}
                onClick={() => edit(p)}
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
          title={editor.id === null ? c.createPackage : c.editPackage}
          busy={mutation.busy}
          mutation={mutation}
          onClose={() => setEditor(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutation.run(() =>
                catalogApi.savePackage(editor.id, {
                  ...form,
                  price: Number(form.price),
                  name: form.name.trim(),
                }),
              )
            ) {
              setEditor(null);
              state.reload();
            }
          }}
        >
          {editor.id !== null && editor.id !== DAY_PASS_PACKAGE_ID && (
            <ActivitySwitch
              checked={form.isActive ?? true}
              onChange={(isActive) => setForm({ ...form, isActive })}
            />
          )}
          <div className="form-grid">
            <Field label={l.name} required>
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={l.price} required hint={c.priceHint}>
              <input
                required
                type="number"
                min={1000}
                max={1000000000}
                step={1000}
                value={form.price}
                onChange={(e) =>
                  setForm({
                    ...form,
                    price: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label={t.refactor.days} required>
              <input
                required
                type="number"
                min={editor.id === DAY_PASS_PACKAGE_ID ? 1 : 2}
                max={editor.id === DAY_PASS_PACKAGE_ID ? 1 : 3650}
                readOnly={editor.id === DAY_PASS_PACKAGE_ID}
                value={form.durationDays}
                onChange={(e) =>
                  setForm({ ...form, durationDays: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <Field label={l.description}>
            <textarea
              maxLength={1000}
              value={form.description ?? ""}
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

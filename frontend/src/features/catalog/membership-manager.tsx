"use client";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import type { MembershipPackageDto } from "@/lib/types";
import { Card, Field, StatusChip } from "@/components/ui";
import { useMutation } from "@/features/operations";
import { catalogApi, type SavePackage } from "./api";
import {
  ActivityDialog,
  CatalogFeedback,
  CatalogFilters,
  CatalogFormDialog,
  CatalogTable,
  matchesCatalog,
  useCatalogFilters,
} from "./manager-shared";
const empty: SavePackage = {
  name: "",
  price: 100000,
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
  const [activity, setActivity] = useState<MembershipPackageDto | null>(null);
  const edit = (p?: MembershipPackageDto) => {
    mutation.reset();
    setEditor({ id: p?.packageId ?? null });
    setForm(
      p
        ? {
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
      <Card
        title={c.gymPackages}
        hint={l.snapshotHint}
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
        <CatalogFilters filters={filters} />
        <CatalogTable
          state={state}
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
            { id: "durationDays", header: t.refactor.days, numeric: true },
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
                className="btn btn--secondary btn--sm"
                disabled={mutation.busy}
                onClick={() => edit(p)}
              >
                {l.edit}
              </button>
              <button
                className="btn btn--ghost btn--sm"
                disabled={mutation.busy}
                onClick={() => {
                  mutation.reset();
                  setActivity(p);
                }}
              >
                {p.isActive ? l.deactivate : l.activate}
              </button>
            </>
          )}
        />
        {!editor && !activity && <CatalogFeedback mutation={mutation} />}
      </Card>
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
                  name: form.name.trim(),
                }),
              )
            ) {
              setEditor(null);
              state.reload();
            }
          }}
        >
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
                  setForm({ ...form, price: Number(e.target.value) })
                }
              />
            </Field>
            <Field label={t.refactor.days} required>
              <input
                required
                type="number"
                min={1}
                max={3650}
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
      {activity && (
        <ActivityDialog
          name={activity.name}
          active={activity.isActive}
          mutation={mutation}
          onClose={() => setActivity(null)}
          onConfirm={async () => {
            if (
              await mutation.run(() => catalogApi.setPackageActive(activity))
            ) {
              setActivity(null);
              state.reload();
            }
          }}
        />
      )}
    </>
  );
}

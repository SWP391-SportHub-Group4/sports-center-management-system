"use client";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatMoney } from "@/lib/format";
import { AsyncSection, Card, Field } from "@/components/ui";
import styles from "./manager-catalog.module.css";
import { useMutation } from "@/features/operations";
import { catalogApi } from "./api";
import { CatalogFeedback, CatalogFormDialog } from "./manager-shared";
export function PtPricingManager() {
  const { t } = useLanguage();
  const c = t.managerCatalog;
  const state = useApi((s) => catalogApi.ptPricing(s), []);
  const mutation = useMutation();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  return (
    <Card title={c.ptPricing} hint={t.operations.ptPriceHint}>
      <AsyncSection state={state}>
        {(p) => (
          <div className={styles.pricingSummary}>
            <strong>{c.ptService}</strong>
            <p className={styles.priceValue}>
              {formatMoney(p.pricePerSessionVnd)}
            </p>

            <button
              className="btn btn--secondary btn--sm"
              disabled={mutation.busy}
              onClick={() => {
                mutation.reset();
                setPrice(String(p.pricePerSessionVnd));
                setOpen(true);
              }}
            >
              {t.operations.edit}
            </button>
          </div>
        )}
      </AsyncSection>
      {!open && <CatalogFeedback mutation={mutation} />}
      {open && (
        <CatalogFormDialog
          title={c.editPtPrice}
          busy={mutation.busy}
          mutation={mutation}
          onClose={() => setOpen(false)}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await mutation.run(() => catalogApi.savePtPrice(price))) {
              setOpen(false);
              state.reload();
            }
          }}
        >
          <p>{c.ptService}</p>
          <Field label={t.operations.ptPrice} required hint={c.priceHint}>
            <input
              required
              type="number"
              min={1000}
              max={100000000}
              step={1000}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <p className="small muted">{t.operations.ptPriceHint}</p>
        </CatalogFormDialog>
      )}
    </Card>
  );
}

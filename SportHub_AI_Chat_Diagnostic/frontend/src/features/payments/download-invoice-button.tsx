"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/primitives";
import { downloadFile } from "@/lib/apiClient";

export function DownloadInvoiceButton({
  invoiceId,
  block = false,
}: {
  invoiceId: string;
  block?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <Button
        variant="secondary"
        block={block}
        loading={busy}
        loadingLabel="Downloading invoice"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await downloadFile(
              `/api/invoices/${invoiceId}/receipt.pdf`,
              `SportHub-invoice-${invoiceId}.pdf`,
            );
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Could not download the invoice. Please try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={16} aria-hidden="true" />
        Download invoice
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

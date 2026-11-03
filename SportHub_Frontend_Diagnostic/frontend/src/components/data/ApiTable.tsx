"use client";

import Link from "next/link";
import type { TableProps } from "@/components/contracts/table";
import { stateKindFromStatus } from "@/components/contracts/state";
import type { AsyncState } from "@/lib/useApi";
import type { Paged } from "@/lib/types";
import { pagedItems } from "@/lib/paged";
import { useLanguage } from "@/lib/language";
import { StateView } from "./StateView";
import { Table } from "./Table";

/** Connects the existing HTTP state to Table without coupling Table itself to API calls. */
export function ApiTable<Row>({
  state,
  page,
  pageSize,
  onPageChange,
  ...props
}: Omit<TableProps<Row>, "rows" | "pagination" | "status"> & {
  state: AsyncState<Paged<Row>>;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useLanguage();
  if (state.error) {
    const kind = stateKindFromStatus(state.error.status);
    return (
      <StateView
        kind={kind}
        title={t.dataTable[`${kind}Title`]}
        description={
          kind === "error" ? state.error.message : t.dataTable[`${kind}Hint`]
        }
        code={state.error.code}
        action={
          kind === "forbidden" ? (
            <Link className="btn btn--secondary" href="/">
              {t.dataTable.home}
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={state.reload}
            >
              {kind === "conflict" ? t.dataTable.reload : t.common.retry}
            </button>
          )
        }
      />
    );
  }
  return (
    <Table
      {...props}
      rows={state.data ? pagedItems(state.data) : []}
      status={state.loading ? "loading" : "ready"}
      pagination={{
        page: state.data?.page ?? page,
        pageSize: state.data?.pageSize ?? pageSize,
        totalCount: state.data?.totalCount ?? 0,
        onChange: onPageChange,
      }}
    />
  );
}

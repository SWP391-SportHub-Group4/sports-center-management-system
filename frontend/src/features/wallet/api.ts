import { api } from "@/lib/apiClient";
import type { WalletBalanceDto, WalletLedgerDto } from "@/lib/types";
export const walletApi = {
  balance: (signal?: AbortSignal) =>
    api.get<WalletBalanceDto>("/api/wallet/me", { signal }),
  ledger: (page: number, signal?: AbortSignal, entryType?: string) =>
    api.get<WalletLedgerDto[]>("/api/wallet/me/ledger", {
      signal,
      query: { page, pageSize: 20, entryType: entryType || undefined },
    }),
};

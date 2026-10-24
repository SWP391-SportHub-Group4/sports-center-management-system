import { api } from "@/lib/apiClient";

export interface CoachCredential {
  credentialId: string;
  kind: "CERTIFICATE" | "AWARD";
  title: string;
  issuer: string | null;
  issuedOn: string | null;
  fileName: string;
  fileUrl: string;
  contentType: string;
  sizeBytes: number;
  isPublished: boolean;
  version: number;
  createdAtUtc: string;
}
export type CredentialDetails = Pick<
  CoachCredential,
  "kind" | "title" | "issuer" | "issuedOn" | "isPublished"
>;
export const credentialsApi = {
  mine: (signal?: AbortSignal) =>
    api.get<CoachCredential[]>("/api/coaches/me/credentials", { signal }),
  public: (coachId: string, signal?: AbortSignal) =>
    api.get<CoachCredential[]>(`/api/coaches/${coachId}/credentials`, {
      signal,
      anonymous: true,
    }),
  upload: (details: CredentialDetails, file: File) => {
    const body = new FormData();
    body.append("kind", details.kind);
    body.append("title", details.title);
    body.append("issuer", details.issuer ?? "");
    body.append("issuedOn", details.issuedOn ?? "");
    body.append("isPublished", String(details.isPublished));
    body.append("file", file);
    return api.postForm<CoachCredential>("/api/coaches/me/credentials", body);
  },
  update: (record: CoachCredential, details: CredentialDetails) =>
    api.put<CoachCredential>(
      `/api/coaches/me/credentials/${record.credentialId}`,
      { ...details, version: record.version },
    ),
  remove: (id: string) => api.del(`/api/coaches/me/credentials/${id}`),
};

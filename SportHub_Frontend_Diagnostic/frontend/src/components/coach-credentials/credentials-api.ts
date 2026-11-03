import { api, fetchBlob } from "@/lib/apiClient";

export interface CoachCredential {
  credentialId: string;
  kind: "CERTIFICATE" | "AWARD";
  title: string;
  issuer: string | null;
  issuedOn: string | null;
  fileName: string;
  fileUrl: string;
  contentUrl?: string | null;
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
  content: async (
    document: Pick<CoachCredential, "contentUrl" | "fileUrl">,
    signal?: AbortSignal,
  ) => {
    if (document.contentUrl) {
      // Only the document endpoint on our configured API may receive the token.
      if (
        !/^\/api\/coaches\/[0-9a-f-]{36}\/credentials\/[0-9a-f-]{36}\/file$/i.test(
          document.contentUrl,
        )
      )
        throw new Error("Invalid document address");
      return fetchBlob(document.contentUrl, { signal });
    }
    // Older APIs return only a public Cloudinary URL. Never forward credentials.
    const response = await fetch(document.fileUrl, {
      signal,
      credentials: "omit",
    });
    if (!response.ok) throw new Error("Document unavailable");
    return response.blob();
  },
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

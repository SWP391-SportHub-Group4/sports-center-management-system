import { api } from "@/lib/apiClient";

let storageVersion = 0;
export const getKnowledgeVersion = () => storageVersion;
export const subscribeKnowledge = (notify: () => void) => {
  window.addEventListener("sporthub:knowledge-changed", notify);
  return () => window.removeEventListener("sporthub:knowledge-changed", notify);
};
function changed() {
  storageVersion++;
  window.dispatchEvent(new Event("sporthub:knowledge-changed"));
}
export type Audience = "Member" | "Coach" | "Both";
export type Category = "Rules" | "Policies" | "Procedures" | "General";
export type Content = {
  title: string;
  audience: Audience;
  category: Category;
  content: string;
};
export type Revision = Content & {
  version: number;
  savedAt: string;
  author: string;
  authorId?: string;
  action?: string;
};
export type Article = {
  id: string;
  sourceVersion: string;
  sourceFile: string;
  draft?: Content | null;
  active?: Revision | null;
  history: Revision[];
  createdAt: string;
  updatedAt: string;
  revision: number;
};
export const creationTime = (a: Article) => a.createdAt;
export const newestFirst = (a: Article, b: Article) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
export const audienceLabels = {
  Member: "Member",
  Coach: "Coach",
  Both: "Members & coaches",
};
export const categoryLabels = {
  Rules: "Rule",
  Policies: "Policy",
  Procedures: "Procedure",
  General: "General information",
};
export const blank: Content = {
  title: "",
  audience: "Member",
  category: "General",
  content: "",
};
export const visible = (a: Article): Content =>
  a.draft ?? a.active ?? a.history[0];
export const status = (a: Article) => (a.active ? "Active" : "Draft");
const base = "/api/ai/system-prompts";
export const knowledgeService = {
  async list(): Promise<Article[]> {
    return (await api.get<Article[]>(base)).sort(newestFirst);
  },
  async save(
    id: string,
    content: Content,
    publish: boolean,
    expectedRevision: number,
  ): Promise<Article> {
    const body = { ...content, expectedRevision };
    const result = publish
      ? await api.post<Article>(base + "/" + id + "/publish", body)
      : await api.put<Article>(base + "/" + id + "/draft", body);
    changed();
    return result;
  },
  async restore(
    id: string,
    version: number,
    expectedRevision: number,
  ): Promise<Article> {
    const result = await api.post<Article>(base + "/" + id + "/restore", {
      version,
      expectedRevision,
    });
    changed();
    return result;
  },
  async remove(id: string, expectedRevision: number): Promise<void> {
    await api.del(base + "/" + id, { query: { expectedRevision } });
    changed();
  },
};

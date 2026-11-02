"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock,
  History,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/apiClient";
import {
  audienceLabels,
  blank,
  categoryLabels,
  creationTime,
  newestFirst,
  knowledgeService,
  getKnowledgeVersion,
  subscribeKnowledge,
  status,
  visible,
  type Article,
  type Content,
  type Revision,
} from "./service";
import s from "./workspace.module.css";
import { PromptTestChat } from "./test-chat";

type Panel = { kind: "preview" | "history" | "test"; article?: Article };
type Confirmation = {
  title: string;
  body: string;
  label: string;
  action: () => void | Promise<void>;
};
const dates = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
const statusLabels = {
  Active: "Active",
  Draft: "Draft",
};

function previousBrowserVersion(
  userId: string,
  id: string,
  audience: Content["audience"],
): Content | null {
  try {
    const rows = JSON.parse(
      localStorage.getItem(`sporthub.system-prompts.demo.v2.${userId}`) ?? "[]",
    );
    if (!Array.isArray(rows)) return null;
    const row = rows.find((row) => row && row.id === id);
    const value = row?.draft ?? row?.active;
    if (typeof value?.title !== "string" || typeof value?.content !== "string")
      return null;
    return {
      title: value.title,
      content: value.content,
      audience,
      category: Object.hasOwn(categoryLabels, value.category)
        ? value.category
        : "General",
    };
  } catch {
    return null;
  }
}

function Overlay({
  title,
  children,
  close,
  drawer = false,
  locked = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  drawer?: boolean;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={drawer ? s.drawer : s.modal}
      aria-labelledby="knowledge-overlay-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !locked) close();
      }}
    >
      <div className={s.overlayHead}>
        <h2 id="knowledge-overlay-title">{title}</h2>
        <button
          type="button"
          className={s.icon}
          aria-label="Close"
          onClick={close}
          disabled={locked}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function KnowledgeWorkspace({ id }: { id?: string }) {
  const { user } = useAuth();
  const storageVersion = useSyncExternalStore(
    subscribeKnowledge,
    getKnowledgeVersion,
    () => 0,
  );
  const listVersion = id ? 0 : storageVersion;
  const router = useRouter();
  const [rows, setRows] = useState<Article[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Content>({ ...blank });
  const [baseline, setBaseline] = useState(JSON.stringify(blank));
  const [legacyContent, setLegacyContent] = useState<Content | null>(null);
  const initializedFor = useRef("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const allowLeave = useRef(false);
  const [toast, setToast] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<Revision | null>(null);
  const article = rows.find((a) => a.id === id);
  const dirty = !!id && loaded && JSON.stringify(form) !== baseline;
  const userId = user?.userId;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await knowledgeService.list();
        if (cancelled) return;
        setRows(data);
        const initial = data.find((a) => a.id === id);
        const content = initial
          ? { ...visible(initial) }
          : {
              ...blank,
              audience: data.some((a) => a.id === "member-system-prompt")
                ? ("Coach" as const)
                : ("Member" as const),
            };
        const editorKey = `${userId}:${id ?? "list"}`;
        if (initializedFor.current !== editorKey) {
          setForm(content);
          setBaseline(JSON.stringify(content));
          initializedFor.current = editorKey;
          if (id && initial) {
            const legacy = previousBrowserVersion(userId, id, content.audience);
            if (
              legacy &&
              (legacy.content !== content.content ||
                legacy.title !== content.title)
            )
              setLegacyContent(legacy);
          }
        }
        setError("");
      } catch {
        setError(
          "Unable to load system prompts from the server. Reload to retry.",
        );
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, id, listVersion]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const confirmLeave = (url: string) => {
      setPanel(null);
      setConfirmation({
        title: "Unsaved changes",
        body: "You have unsaved changes. Discard them and leave this page?",
        label: "Discard changes",
        action: () => {
          allowLeave.current = true;
          window.location.assign(url);
        },
      });
    };
    // Navigation API fires before same-document history traversal. Other
    // browsers retain the anchor guard and native full-document unload warning.
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const traverse = (event: Event) => {
      const historyEvent = event as Event & {
        navigationType?: string;
        destination?: { url: string };
      };
      if (
        !allowLeave.current &&
        historyEvent.navigationType === "traverse" &&
        event.cancelable &&
        historyEvent.destination
      ) {
        event.preventDefault();
        confirmLeave(historyEvent.destination.url);
      }
    };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !link ||
        link.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        link.href === location.href ||
        link.hash
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      confirmLeave(link.href);
    };
    window.addEventListener("beforeunload", unload);
    navigation?.addEventListener("navigate", traverse);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      navigation?.removeEventListener("navigate", traverse);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);

  const update = (key: keyof Content, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFields((f) => ({ ...f, [key]: "" }));
  };
  const validate = () => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = "Enter a title.";
    if (form.title.length > 180)
      errors.title = "Title must be 180 characters or fewer.";
    if (!form.content.trim()) errors.content = "Enter the knowledge content.";
    if (form.content.length > 30000)
      errors.content = "Content must be 30,000 characters or fewer.";
    setFields(errors);
    if (Object.keys(errors).length) {
      document.getElementById(`knowledge-${Object.keys(errors)[0]}`)?.focus();
      return false;
    }
    return true;
  };
  const commit = async (
    action: () => Promise<Article[]>,
    message: string,
  ): Promise<Article[] | null> => {
    if (!userId || saving.current) return null;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await action();
      setRows(data);
      setToast(message);
      return data;
    } catch (error) {
      setError(
        (error instanceof ApiError
          ? error.message
          : "Unable to save system prompts. Check the connection and retry.") +
          " Your edits have been kept.",
      );
      return null;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const merge = (saved: Article) =>
    [...rows.filter((a) => a.id !== saved.id), saved].sort(newestFirst);
  const save = async (publish: boolean) => {
    if (!validate()) return;
    const key =
      id === "new"
        ? form.audience === "Coach"
          ? "coach-system-prompt"
          : "member-system-prompt"
        : id!;
    if (id === "new" && rows.some((a) => a.id === key)) {
      setError(
        "This role already has a system prompt. Edit the existing prompt instead.",
      );
      return;
    }
    const data = await commit(
      async () =>
        merge(
          await knowledgeService.save(
            key,
            { ...form, title: form.title.trim() },
            publish,
            article?.revision ?? 0,
          ),
        ),
      publish
        ? "Published. The next chat message will use this prompt."
        : "Draft saved to the server. The live prompt is unchanged.",
    );
    if (data) {
      const saved = visible(data.find((a) => a.id === key)!);
      setForm(saved);
      setBaseline(JSON.stringify(saved));
      setConfirmation(null);
      if (id === "new") router.replace("/manager/ai-knowledge/" + key);
    }
  };
  const publish = () => {
    if (!validate()) return;
    setConfirmation({
      title: "Publish system prompt",
      body:
        "Publish “" +
        form.title +
        "” for " +
        audienceLabels[form.audience] +
        " now? The live chatbot will use this version from its next message. Other managers will see this publication too.",
      label: "Publish",
      action: () => save(true),
    });
  };
  const deleteArticle = (a: Article) => {
    setPanel(null);
    setConfirmation({
      title: "Delete system prompt",
      body:
        "Permanently delete “" +
        visible(a).title +
        "”, including its drafts and history? This cannot be undone. The " +
        audienceLabels[visible(a).audience] +
        " chatbot will return to its built-in default prompt from the next message.",
      label: "Delete",
      action: async () => {
        if (
          await commit(async () => {
            await knowledgeService.remove(a.id, a.revision);
            return rows.filter((row) => row.id !== a.id);
          }, "Prompt deleted. The chatbot now uses its built-in default.")
        )
          setConfirmation(null);
      },
    });
  };
  const restore = (a: Article, revision: Revision) => {
    setPanel(null);
    setConfirmation({
      title: "Restore version",
      body:
        "Restore the last published version of “" +
        revision.title +
        "”? The live chatbot will use the restored content from its next message. The editor will show the restored version, replacing any unsaved edits. Saved drafts remain on the server.",
      label: "Restore",
      action: async () => {
        const data = await commit(
          async () =>
            merge(
              await knowledgeService.restore(
                a.id,
                revision.version,
                a.revision,
              ),
            ),
          "Version restored and published.",
        );
        if (data) {
          setConfirmation(null);
          const restored = data.find((row) => row.id === a.id)?.active;
          if (id === a.id && restored) {
            const { title, audience, category, content } = restored;
            const restoredContent = { title, audience, category, content };
            setForm(restoredContent);
            setBaseline(JSON.stringify(restoredContent));
            setFields({});
          }
        }
      },
    });
  };
  const openPanel = (kind: Panel["kind"], a?: Article) => {
    setSelectedVersion(null);
    setPanel({ kind, article: a });
  };
  const filtered = rows
    .filter((a) => {
      const c = visible(a);
      return (
        c.title
          .toLocaleLowerCase("en")
          .includes(query.toLocaleLowerCase("en")) &&
        (!audience || c.audience === audience) &&
        (!category || c.category === category) &&
        (!state || status(a) === state)
      );
    })
    .sort(newestFirst);
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pages);

  return (
    <section className={s.workspace} aria-label="AI Knowledge workspace">
      <div className={s.heading}>
        <div>
          {id && (
            <Link href="/manager/ai-knowledge" className={s.back}>
              <ArrowLeft size={16} />
              Back to knowledge
            </Link>
          )}
          <h1>
            {id
              ? id === "new"
                ? "New knowledge"
                : "Edit knowledge"
              : "AI Knowledge"}
          </h1>
          <p>
            Review the system prompts used by the Member and Coach chat
            assistants.
          </p>
        </div>
        {!id && loaded && rows.length < 2 && (
          <Link className={s.primary} href="/manager/ai-knowledge/new">
            <Plus size={18} />
            Add content
          </Link>
        )}
      </div>
      <div className={s.notice}>
        <BookOpen size={20} aria-hidden="true" />
        <div>
          <strong>Live system prompts</strong>
          <p>
            Publish updates the live chatbot from its next message. Save draft
            keeps your changes on the server without changing the active prompt.
          </p>
        </div>
      </div>
      {legacyContent && (
        <div className={s.notice}>
          <div>
            <strong>Previous browser version available</strong>
            <p>
              Your earlier browser-only edits have not been published or
              discarded. Load them into the editor to review before saving or
              publishing.
            </p>
            <button
              className={s.secondary}
              type="button"
              onClick={() => {
                setForm(legacyContent);
                setLegacyContent(null);
              }}
            >
              Load previous browser version
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className={s.error} role="alert">
          {error}{" "}
          {!loaded || !rows.length ? (
            <button onClick={() => location.reload()}>Reload</button>
          ) : null}
        </div>
      )}
      {!loaded ? (
        <div className={s.loading} aria-busy="true">
          Loading knowledge…
        </div>
      ) : id && id !== "new" && !article ? (
        <div className={s.empty}>
          <h2>Knowledge unavailable</h2>
          <p>This prompt was not found on the server.</p>
          <Link href="/manager/ai-knowledge">Back to knowledge</Link>
        </div>
      ) : id ? (
        <>
          <div className={s.editorTop}>
            <span className={s.badge}>
              {article ? statusLabels[status(article)] : "New draft"}
            </span>
            <span>{dirty ? "Unsaved changes" : "No new changes"}</span>
            {article?.active && (
              <span>
                The published prompt is currently used by the live chatbot.
              </span>
            )}
            {article && (
              <button
                className={s.textButton}
                onClick={() => openPanel("history", article)}
              >
                <History size={16} />
                Version history
              </button>
            )}
          </div>
          <form
            className={s.editor}
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <div className={s.formBody}>
              <label htmlFor="knowledge-title">
                Title <span aria-hidden="true">*</span>
              </label>
              <input
                id="knowledge-title"
                value={form.title}
                maxLength={181}
                onChange={(e) => update("title", e.target.value)}
                aria-required="true"
                aria-invalid={!!fields.title}
                aria-describedby={fields.title ? "title-error" : undefined}
                placeholder="Example: Membership freeze policy"
              />
              {fields.title && (
                <p id="title-error" className={s.fieldError}>
                  {fields.title}
                </p>
              )}
              <div className={s.formGrid}>
                <div>
                  <label htmlFor="knowledge-category">Category</label>
                  <select
                    id="knowledge-category"
                    value={form.category}
                    onChange={(e) => update("category", e.target.value)}
                  >
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="knowledge-audience">Audience</label>
                  <select
                    id="knowledge-audience"
                    disabled={id !== "new"}
                    value={form.audience}
                    onChange={(e) => update("audience", e.target.value)}
                  >
                    {Object.entries(audienceLabels)
                      .filter(([key]) => key !== "Both")
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <p className={s.helper}>
                This content is provided to AI only when assisting the selected
                audience.
              </p>
              <label htmlFor="knowledge-content">
                Content <span aria-hidden="true">*</span>
              </label>
              <p id="content-help" className={s.helper}>
                Include requirements, steps and a contact point. Use paragraphs
                or numbered lists.
              </p>
              <textarea
                id="knowledge-content"
                rows={16}
                value={form.content}
                onChange={(e) => update("content", e.target.value)}
                aria-required="true"
                aria-invalid={!!fields.content}
                aria-describedby={`content-help${fields.content ? " content-error" : ""}`}
                placeholder="Enter the center rules or procedures…"
              />
              {fields.content && (
                <p id="content-error" className={s.fieldError}>
                  {fields.content}
                </p>
              )}
              <p className={s.counter}>
                {form.content.length.toLocaleString("en-GB")} / 30,000
                characters
              </p>
            </div>
            <div className={s.editorActions}>
              <Link href="/manager/ai-knowledge" className={s.secondary}>
                Back
              </Link>
              <div>
                <button
                  type="button"
                  className={s.secondary}
                  onClick={() => {
                    if (validate()) openPanel("test");
                  }}
                >
                  Test with AI
                </button>
                <button type="submit" className={s.secondary} disabled={busy}>
                  Save draft
                </button>
                <button
                  type="button"
                  className={s.primary}
                  onClick={publish}
                  disabled={busy}
                >
                  <Check size={17} />
                  {busy ? "Saving…" : "Publish"}
                </button>
              </div>
            </div>
          </form>
        </>
      ) : (
        <>
          <div className={s.filters}>
            <label className={s.search}>
              <Search size={18} />
              <span className={s.srOnly}>Search by title</span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by title…"
              />
            </label>
            <label>
              <span className={s.srOnly}>Filter by audience</span>
              <select
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All audiences</option>
                {Object.entries(audienceLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={s.srOnly}>Filter by category</span>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All categories</option>
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={s.srOnly}>Filter by status</span>
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <caption className={s.srOnly}>Center AI knowledge list</caption>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Audience</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th aria-sort="descending">Created</th>
                  <th>
                    <span className={s.srOnly}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice((currentPage - 1) * 8, currentPage * 8)
                  .map((a) => {
                    const content = visible(a);
                    return (
                      <tr key={a.id}>
                        <td>
                          <Link
                            className={s.titleLink}
                            href={`/manager/ai-knowledge/${a.id}`}
                          >
                            {content.title}
                          </Link>
                          <span className={s.mobileAudience}>
                            {audienceLabels[content.audience]}
                          </span>
                          {a.draft && a.active && <small>Draft available · current version retained</small>}
                          {!a.active && <small>Not provided to AI</small>}
                        </td>
                        <td>{audienceLabels[content.audience]}</td>
                        <td>{categoryLabels[content.category]}</td>
                        <td>
                          <span className={s.badge} data-state={status(a)}>
                            {status(a) === "Active" ? (
                              <Check size={13} />
                            ) : (
                              <Clock size={13} />
                            )}
                            {statusLabels[status(a)]}
                          </span>
                        </td>
                        <td className={s.date}>{dates(creationTime(a))}</td>
                        <td>
                          <details className={s.menu}>
                            <summary aria-label={`Actions: ${content.title}`}>
                              <MoreHorizontal size={20} />
                            </summary>
                            <div>
                              <button
                                onClick={(e) => {
                                  e.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                  openPanel("preview", a);
                                }}
                              >
                                Quick view
                              </button>
                              <Link href={`/manager/ai-knowledge/${a.id}`}>
                                Edit
                              </Link>
                              <button
                                onClick={(e) => {
                                  e.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                  openPanel("history", a);
                                }}
                              >
                                History
                              </button>
                              <button
                                onClick={(e) => {
                                  e.currentTarget
                                    .closest("details")
                                    ?.removeAttribute("open");
                                  deleteArticle(a);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {!filtered.length && (
              <div className={s.empty}>
                <BookOpen size={32} />
                <h2>
                  {rows.length ? "No matching knowledge" : "No managed prompts"}
                </h2>
                <p>
                  {rows.length
                    ? "Try another search or clear the filters to see more content."
                    : "Create a Member or Coach prompt to replace its built-in default."}
                </p>
                {rows.length ? (
                  <button
                    className={s.secondary}
                    onClick={() => {
                      setQuery("");
                      setAudience("");
                      setCategory("");
                      setState("");
                    }}
                  >
                    Clear filters
                  </button>
                ) : (
                  <Link className={s.primary} href="/manager/ai-knowledge/new">
                    Add content
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className={s.pagination}>
            <span>
              {filtered.length} prompts · Page {currentPage}/{pages}
            </span>
            <div>
              <button
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <button
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
      {panel && panel.kind !== "test" && !confirmation && (
        <Overlay
          drawer
          title={
            panel.kind === "history" ? "Version history" : "Knowledge preview"
          }
          close={() => setPanel(null)}
        >
          <div className={s.panelBody}>
            {panel.kind === "preview" && panel.article && (
              <>
                <span className={s.badge}>
                  {audienceLabels[visible(panel.article).audience]}
                </span>
                <h3>{visible(panel.article).title}</h3>
                
                <p className={s.helper}>
                  Viewing{" "}
                  {panel.article.draft
                    ? "draft"
                    : statusLabels[status(panel.article)].toLowerCase()}{" "}
                  · {categoryLabels[visible(panel.article).category]}
                </p>
                <div className={s.prose}>{visible(panel.article).content}</div>
                <Link
                  className={s.secondary}
                  href={`/manager/ai-knowledge/${panel.article.id}`}
                >
                  Edit content
                </Link>
              </>
            )}
            {panel.kind === "history" && panel.article && (
              <>
                <p>{visible(panel.article).title}</p>
                <p className={s.helper}>
                  Only the previous published version is kept. Saving a draft
                  does not change this history.
                </p>
                {panel.article.history.length === 0 && (
                  <p className={s.helper}>No previous published version yet.</p>
                )}
                <div className={s.versions}>
                  {panel.article.history.map((r) => (
                    <button
                      className={s.version}
                      key={r.version}
                      onClick={() => setSelectedVersion(r)}
                      aria-pressed={selectedVersion?.version === r.version}
                    >
                      <strong>Last version</strong>
                      <span>
                        {dates(r.savedAt)} · {r.author}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedVersion && (
                  <>
                    <h3>{selectedVersion.title}</h3>
                    <p className={s.helper}>
                      {audienceLabels[selectedVersion.audience]}
                    </p>
                    <div className={s.prose}>{selectedVersion.content}</div>
                    <button
                      className={s.secondary}
                      onClick={() => restore(panel.article!, selectedVersion)}
                    >
                      Restore last version
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </Overlay>
      )}
      {panel?.kind === "test" && !confirmation && (
        <PromptTestChat
          form={form}
          article={article}
          articles={rows}
          dirty={dirty}
          onClose={() => setPanel(null)}
        />
      )}
      {confirmation && (
        <Overlay
          title={confirmation.title}
          close={() => setConfirmation(null)}
          locked={busy}
        >
          <div className={s.panelBody}>
            <p>{confirmation.body}</p>
            {error && (
              <p role="alert" className={s.fieldError}>
                {error}
              </p>
            )}
            <div className={s.confirmActions}>
              <button
                className={s.secondary}
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Back
              </button>
              <button
                className={s.primary}
                disabled={busy}
                onClick={() => void confirmation.action()}
              >
                {busy ? "Saving…" : confirmation.label}
              </button>
            </div>
          </div>
        </Overlay>
      )}
      <div
        className={toast ? s.toast : s.srOnly}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </section>
  );
}

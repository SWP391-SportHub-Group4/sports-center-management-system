"use client";
import { useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Award,
  FileText,
  GraduationCap,
  Upload,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import { AsyncSection, Dialog, Field, Feedback } from "@/components/ui";
import { useAction, useApi } from "@/lib/useApi";
import { formatDate } from "@/lib/format";
import {
  credentialsApi,
  type CoachCredential,
  type CredentialDetails,
} from "./credentials-api";
import s from "./coach-credentials.module.css";

const limit = 10 * 1024 * 1024;
const types = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const fileSize = (n: number) =>
  n < 1024 * 1024
    ? `${Math.max(1, Math.ceil(n / 1024))} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;
function CredentialImage({
  document,
  full = false,
}: {
  document: CoachCredential;
  full?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const pdf = document.contentType === "application/pdf";
  if (pdf || failed)
    return (
      <span className={s.filePlaceholder}>
        <FileText size={full ? 52 : 28} aria-hidden="true" />
        <span>{pdf ? "PDF document" : "Open original to view"}</span>
      </span>
    );
  const url = full
    ? document.fileUrl
    : document.fileUrl.replace(
        "/image/upload/",
        "/image/upload/f_auto,q_auto,c_limit,w_960,h_680/",
      );
  return (
    <Image
      src={url}
      alt={document.title}
      width={960}
      height={680}
      unoptimized
      className={s.documentImage}
      onError={() => setFailed(true)}
    />
  );
}

function usePdfPreview(document: CoachCredential, enabled: boolean) {
  const { fileUrl, contentUrl } = document;
  const source = contentUrl || fileUrl;
  const [preview, setPreview] = useState({ source: "", url: "", error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let active = true;
    let objectUrl = "";
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 135000);

    async function load() {
      try {
        const file = await credentialsApi.content(
          { fileUrl, contentUrl },
          controller.signal,
        );
        if (
          file.size === 0 ||
          file.size > limit ||
          !(await file.slice(0, 5).text()).startsWith("%PDF-")
        )
          throw new Error("Invalid PDF response");
        if (!active) return;
        objectUrl = URL.createObjectURL(
          new Blob([file], { type: "application/pdf" }),
        );
        setPreview({ source, url: objectUrl, error: "" });
      } catch {
        if (!active || (controller.signal.aborted && !timedOut)) return;
        setPreview({
          source,
          url: "",
          error: timedOut
            ? "This PDF took too long to load. Please try again."
            : "Could not load this PDF. Please try again. If it still does not load, contact support.",
        });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl, contentUrl, source, enabled, attempt]);

  return {
    ...(preview.source === source ? preview : { url: "", error: "" }),
    retry: () => {
      setPreview({ source, url: "", error: "" });
      setAttempt((value) => value + 1);
    },
  };
}

function PdfPreview({
  document,
  preview,
}: {
  document: CoachCredential;
  preview: ReturnType<typeof usePdfPreview>;
}) {
  return (
    <div className={s.pdfPreview}>
      {preview.error ? (
        <div className={s.pdfState} role="alert">
          <FileText size={36} aria-hidden="true" />
          <p>{preview.error}</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={preview.retry}
          >
            Retry
          </button>
        </div>
      ) : preview.url ? (
        <>
          <div className={s.pdfTools}>
            <span>Browse all pages using the PDF viewer controls.</span>
          </div>
          <iframe
            title={`${document.title} PDF preview`}
            src={`${preview.url}#toolbar=1&navpanes=0`}
            className={s.pdfFrame}
          />
        </>
      ) : (
        <div className={s.pdfState} role="status">
          <FileText size={36} aria-hidden="true" />
          <p>Loading PDF…</p>
        </div>
      )}
    </div>
  );
}

function DocumentViewer({
  document,
  onClose,
}: {
  document: CoachCredential;
  onClose: () => void;
}) {
  const pdf = document.contentType === "application/pdf";
  const preview = usePdfPreview(document, pdf);
  const originalUrl = pdf ? preview.url : document.fileUrl;
  return createPortal(
    <Dialog
      title={document.title}
      onClose={onClose}
      size="lg"
      className={s.viewer}
      footer={
        <>
          {pdf && preview.url && (
            <a
              href={preview.url}
              download={document.fileName}
              className="btn btn--secondary"
            >
              Download PDF
            </a>
          )}
          {originalUrl ? (
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--secondary"
            >
              Open original <ExternalLink size={16} aria-hidden="true" />
            </a>
          ) : (
            <button type="button" className="btn btn--secondary" disabled>
              Open original <ExternalLink size={16} aria-hidden="true" />
            </button>
          )}
        </>
      }
    >
      <p className={s.documentMeta}>
        {document.kind === "AWARD" ? "Award" : "Certificate"}
        {document.issuer && ` · ${document.issuer}`}
        {document.issuedOn && ` · ${formatDate(document.issuedOn)}`}
      </p>
      <div className={s.fullDocument}>
        {pdf ? (
          <PdfPreview document={document} preview={preview} />
        ) : (
          <CredentialImage document={document} full />
        )}
      </div>
      {pdf && (
        <p className={s.hint}>
          If your browser cannot display the PDF, download it or open the
          original in a new tab.
        </p>
      )}
      <p className={s.fileInfo}>
        {document.fileName} · {fileSize(document.sizeBytes)}
      </p>
    </Dialog>,
    globalThis.document.body,
  );
}
function DocumentForm({
  document,
  onClose,
  onSaved,
}: {
  document: CoachCredential | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const visibilityHintId = useId();
  const [details, setDetails] = useState<CredentialDetails>({
    kind: document?.kind ?? "CERTIFICATE",
    title: document?.title ?? "",
    issuer: document?.issuer ?? "",
    issuedOn: document?.issuedOn ?? "",
    isPublished: document?.isPublished ?? true,
  });
  const [file, setFile] = useState<File | null>(null),
    [fileError, setFileError] = useState("");
  const [preview, setPreview] = useState("");
  const action = useAction();
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!document && !file) {
      setFileError("Choose a document to upload.");
      return;
    }
    const payload = {
      ...details,
      title: details.title.trim(),
      issuer: details.issuer?.trim() || null,
      issuedOn: details.issuedOn || null,
    };
    const result = await action.run(() =>
      document
        ? credentialsApi.update(document, payload)
        : credentialsApi.upload(payload, file!),
    );
    if (result) onSaved();
  }
  return (
    <form
      className={s.form}
      onSubmit={submit}
      aria-label={document ? "Edit document" : "Add document"}
    >
      <h4>{document ? "Edit document" : "Add a certificate or award"}</h4>
      <fieldset disabled={action.busy} className={s.formFields}>
        {!document && (
          <div className={s.uploadArea}>
            <label className={s.uploadLabel}>
              <Upload size={22} aria-hidden="true" />
              <strong>{file ? file.name : "Choose a document"}</strong>
              <span>JPG, PNG, WebP or PDF · up to 10 MB</span>
              <input
                aria-label="Document file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null;
                  setPreview("");
                  setFile(null);
                  action.reset();
                  if (!next) {
                    setFileError("");
                    return;
                  }
                  if (
                    !types.includes(next.type) ||
                    next.size === 0 ||
                    next.size > limit
                  ) {
                    setFileError(
                      "Choose a JPG, PNG, WebP or PDF document no larger than 10 MB.",
                    );
                    e.target.value = "";
                    return;
                  }
                  setFile(next);
                  setPreview(
                    next.type === "application/pdf"
                      ? ""
                      : URL.createObjectURL(next),
                  );
                  setFileError("");
                }}
              />
            </label>
            {preview && file && file.type !== "application/pdf" && (
              <Image
                src={preview}
                alt="Selected document preview"
                width={360}
                height={240}
                unoptimized
                className={s.localPreview}
              />
            )}
            {file?.type === "application/pdf" && (
              <span className={s.pdfSelected}>
                <FileText size={24} aria-hidden="true" />
                PDF · {fileSize(file.size)}
              </span>
            )}
          </div>
        )}
        <div className={s.formGrid}>
          <Field label="Document type">
            <select
              value={details.kind}
              onChange={(e) =>
                setDetails({
                  ...details,
                  kind: e.target.value as CredentialDetails["kind"],
                })
              }
            >
              <option value="CERTIFICATE">Certificate</option>
              <option value="AWARD">Award</option>
            </select>
          </Field>
          <Field label="Title">
            <input
              required
              maxLength={200}
              value={details.title}
              onChange={(e) =>
                setDetails({ ...details, title: e.target.value })
              }
              placeholder="e.g. Badminton Coaching Certificate"
            />
          </Field>
          <Field label="Issuing organization (optional)">
            <input
              maxLength={200}
              value={details.issuer ?? ""}
              onChange={(e) =>
                setDetails({ ...details, issuer: e.target.value })
              }
            />
          </Field>
          <Field label="Date issued (optional)">
            <input
              type="date"
              value={details.issuedOn ?? ""}
              onChange={(e) =>
                setDetails({ ...details, issuedOn: e.target.value })
              }
            />
          </Field>
        </div>
        <label className={s.visibility} data-published={details.isPublished}>
          <input
            type="checkbox"
            aria-label="Show on my public profile"
            aria-describedby={visibilityHintId}
            checked={details.isPublished}
            onChange={(e) =>
              setDetails({ ...details, isPublished: e.target.checked })
            }
          />
          <span>
            <strong>Show on my public profile</strong>
            <small id={visibilityHintId}>
              Members and visitors can open this document.
            </small>
          </span>
        </label>
      </fieldset>
      <Feedback error={fileError || action.error} />
      <div className={s.formActions}>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={action.busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn"
          disabled={action.busy || (!document && !file)}
        >
          {action.busy
            ? "Saving…"
            : document
              ? "Save changes"
              : "Upload document"}
        </button>
      </div>
    </form>
  );
}

export function CoachCredentialsEditor() {
  const state = useApi((signal) => credentialsApi.mine(signal), []);
  const [editing, setEditing] = useState<CoachCredential | "new" | null>(null);
  const [viewing, setViewing] = useState<CoachCredential | null>(null);
  const [removing, setRemoving] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const action = useAction();
  return (
    <section
      id="coach-documents"
      className={s.editorSection}
      aria-label="Certificates and awards"
    >
      <header className={s.sectionHeader}>
        <div>
          <h3>
            <GraduationCap size={20} aria-hidden="true" />
            Certificates & awards
          </h3>
          <p>
            Certificates show your qualifications. Awards highlight your
            achievements.
          </p>
        </div>
        <button
          className="btn btn--secondary"
          type="button"
          disabled={
            state.loading ||
            !!state.error ||
            (state.data?.length ?? 0) >= 20 ||
            action.busy
          }
          onClick={() => {
            setEditing("new");
            setNotice("");
            setRemoving(null);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          Add document
        </button>
      </header>
      <Feedback success={notice} error={action.error} />
      {editing && (
        <DocumentForm
          key={
            editing === "new"
              ? "new"
              : `${editing.credentialId}-${editing.version}`
          }
          document={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice("Document saved.");
            state.reload();
          }}
        />
      )}
      <AsyncSection state={state}>
        {(rows) => (
          <>
            {rows.length ? (
              <ul className={s.documentList}>
                {[
                  ...rows.filter((row) => row.kind === "CERTIFICATE"),
                  ...rows.filter((row) => row.kind === "AWARD"),
                ].map((row, index, documents) => (
                  <li key={row.credentialId}>
                    {(index === 0 ||
                      documents[index - 1].kind !== row.kind) && (
                      <header className={s.groupHeader} data-kind={row.kind}>
                        <h4>
                          {row.kind === "CERTIFICATE"
                            ? "Certificates"
                            : "Awards"}
                        </h4>
                        <span>
                          {rows.filter((item) => item.kind === row.kind).length}{" "}
                          documents
                        </span>
                      </header>
                    )}
                    <div className={s.documentRow}>
                      <button
                        type="button"
                        className={s.thumbnail}
                        aria-label={`View ${row.title}`}
                        onClick={() => setViewing(row)}
                      >
                        <CredentialImage document={row} />
                      </button>
                      <div className={s.documentText}>
                        <span className={s.kind} data-kind={row.kind}>
                          {row.kind === "AWARD" ? (
                            <Award size={13} aria-hidden="true" />
                          ) : (
                            <GraduationCap size={13} aria-hidden="true" />
                          )}
                          {row.kind === "AWARD" ? "Award" : "Certificate"}
                        </span>
                        <h4>{row.title}</h4>
                        <p>
                          {[
                            row.issuer,
                            row.issuedOn ? formatDate(row.issuedOn) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No issuer or date added"}
                        </p>
                        <small className={s.published}>
                          {row.isPublished ? (
                            <Eye size={12} aria-hidden="true" />
                          ) : (
                            <EyeOff size={12} aria-hidden="true" />
                          )}
                          {row.isPublished ? "Public" : "Not displayed"} ·{" "}
                          {fileSize(row.sizeBytes)}
                        </small>
                      </div>
                      <div className={s.rowActions}>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          aria-label={`Edit ${row.title}`}
                          disabled={action.busy}
                          onClick={() => {
                            setEditing(row);
                            setNotice("");
                            setRemoving(null);
                          }}
                        >
                          <Pencil size={15} aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`btn btn--ghost ${s.remove}`}
                          aria-label={`Remove ${row.title}`}
                          disabled={action.busy}
                          onClick={() => {
                            setRemoving(row.credentialId);
                            setEditing(null);
                          }}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </div>
                    {removing === row.credentialId && (
                      <div
                        className={s.removeConfirmation}
                        role="group"
                        aria-label={`Remove ${row.title}?`}
                      >
                        <p>Remove this document from your profile?</p>
                        <div>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            disabled={action.busy}
                            onClick={() => setRemoving(null)}
                          >
                            Keep document
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger"
                            disabled={action.busy}
                            onClick={async () => {
                              const done = await action.run(async () => {
                                await credentialsApi.remove(row.credentialId);
                                return true;
                              });
                              if (done) {
                                setRemoving(null);
                                setNotice("Document removed.");
                                state.reload();
                              }
                            }}
                          >
                            {action.busy ? "Removing…" : "Confirm remove"}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              !editing && (
                <div className={s.empty}>
                  <Award size={32} aria-hidden="true" />
                  <div>
                    <h4>Your achievements belong here</h4>
                    <p>
                      Add a coaching certificate or award so members can learn
                      more about your experience.
                    </p>
                  </div>
                </div>
              )
            )}
            <p className={s.hint}>
              {rows.length}/20 documents total · JPG, PNG, WebP or PDF · Up to
              10 MiB per file. Upload a clear, complete document. Shared
              documents appear on your public profile.
            </p>
          </>
        )}
      </AsyncSection>
      {viewing && (
        <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}

export function CoachCredentialsShowcase({
  coachId,
  kind,
}: {
  coachId: string;
  kind?: CoachCredential["kind"];
}) {
  const state = useApi(
    (signal) => credentialsApi.public(coachId, signal),
    [coachId],
  );
  const [viewing, setViewing] = useState<CoachCredential | null>(null);
  return (
    <section
      id="credentials"
      className={s.showcase}
      aria-label="Certificates and awards"
    >
      {!kind && (
        <header className={s.sectionHeader}>
          <div>
            <h2>
              {kind === "CERTIFICATE"
                ? "Certificates"
                : kind === "AWARD"
                  ? "Awards"
                  : "Certificates & awards"}
            </h2>
            <p>Qualifications and achievements shared by this coach.</p>
          </div>
        </header>
      )}
      <AsyncSection state={state}>
        {(rows) => (
          <div className={s.groups}>
            {(["CERTIFICATE", "AWARD"] as const)
              .filter((item) => !kind || item === kind)
              .map((kind) => {
                const documents = rows.filter((row) => row.kind === kind);
                return (
                  <section
                    key={kind}
                    aria-label={
                      kind === "CERTIFICATE" ? "Certificates" : "Awards"
                    }
                  >
                    <header className={s.groupHeader} data-kind={kind}>
                      <div>
                        <h3>
                          {kind === "CERTIFICATE" ? "Certificates" : "Awards"}
                        </h3>
                        <p>
                          {kind === "CERTIFICATE"
                            ? "Professional qualifications and coaching certifications."
                            : "Recognition, honours and sporting achievements."}
                        </p>
                      </div>
                      <span>{documents.length}</span>
                    </header>
                    {!documents.length && (
                      <p className={s.hint}>
                        {kind === "CERTIFICATE"
                          ? "No certificates shared yet."
                          : "No awards shared yet."}
                      </p>
                    )}
                    <ul className={s.gallery}>
                      {documents.map((row) => (
                        <li key={row.credentialId}>
                          <button
                            className={s.galleryImage}
                            onClick={() => setViewing(row)}
                            aria-label={`View ${row.title}`}
                          >
                            <CredentialImage document={row} />
                            <span>
                              View document{" "}
                              <ExternalLink size={14} aria-hidden="true" />
                            </span>
                          </button>
                          <div className={s.galleryCaption}>
                            <span className={s.kind} data-kind={row.kind}>
                              {row.kind === "AWARD" ? (
                                <Award size={14} aria-hidden="true" />
                              ) : (
                                <GraduationCap size={14} aria-hidden="true" />
                              )}
                              {row.kind === "AWARD" ? "Award" : "Certificate"}
                            </span>
                            <h3>{row.title}</h3>
                            {row.issuer && <p>{row.issuer}</p>}
                            {row.issuedOn && (
                              <small>Issued {formatDate(row.issuedOn)}</small>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
          </div>
        )}
      </AsyncSection>
      {viewing && (
        <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}
